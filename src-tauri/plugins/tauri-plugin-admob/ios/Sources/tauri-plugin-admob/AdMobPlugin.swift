// iOS bridge for Google AdMob (Google Mobile Ads SDK). Mirror of the Android
// plugin at ../../android/src/main/java/com/plugin/admob/AdMobPlugin.kt.
//
// ## The one format
//
// Rewarded INTERSTITIAL ad units only. Google serves skippable creatives
// exclusively into those units, which is what satisfies Google Play's Families
// "closeable after 5 seconds" rule — the rule that rejected com.chaos.arena in
// 2026-09. There is no interstitial / banner / app-open / native-ad code path
// in this file, so no build can accidentally ship a format that fails review.
//
// The caller (JS) owns the other half of the rewarded-interstitial contract:
// an intro screen naming the reward, with a visible decline option, shown
// BEFORE `showRewarded` is invoked. See `RewardedAdIntroModal.vue`.
//
// ## Ordering rules (same as Android)
//
//   1. `MobileAds.shared.requestConfiguration` is populated BEFORE
//      `MobileAds.shared.start(...)`, so no request can leave the device
//      untagged.
//   2. TFCD and TFUA are never both true — Google's targeting guide says they
//      "shouldn't both simultaneously be set to true". TFCD wins here because
//      this app declares a child-directed audience.
//
// ## Apple Kids Category compliance
//
// We never call `ATTrackingManager.requestTrackingAuthorization` — apps in the
// Kids Category may not show the ATT prompt or collect the IDFA. Child-directed
// tagging keeps GMA off the IDFA on its own.
//
// ## API generation
//
// Written against Google Mobile Ads iOS SDK 13.2.0 (the v12+ generation, where
// the GAD prefix was dropped from most types). `GADMaxAdContentRating` keeps
// its prefix — that one is a typed String constant group, not a renamed class.
// Re-verify against https://developers.google.com/admob/ios/migration on bump.

import GoogleMobileAds
import SwiftRs
import Tauri
import UIKit
import WebKit

// JS -> native payload for the initialize command. Shape matches
// `models::InitRequest` on the Rust side; Tauri auto-deserializes.
class InitArgs: Decodable {
    var rewardedAdUnitId: String = ""
    var tagForChildDirectedTreatment: Bool = true
    var tagForUnderAgeOfConsent: Bool = false
    var maxAdContentRating: String = "G"
    var designedForFamilies: Bool = true
    var useTestAds: Bool = false
}

class AdMobPlugin: Plugin, FullScreenContentDelegate {

    private var initialized = false
    private var rewardedAdUnitId = ""
    private var designedForFamilies = true

    private var rewardedAd: RewardedInterstitialAd?
    private var isLoading = false

    private var pendingRewarded: Invoke?
    // The reward handler fires before `adDidDismissFullScreenContent`. We latch
    // it here and resolve on dismiss, so the caller learns both that the ad
    // finished AND whether the reward was earned. A player who taps skip
    // dismisses without earning: `rewarded` stays false and the game grants
    // nothing. That is the intended, policy-compliant path.
    private var lastRewardGranted = false

    // Resolves the active webview's containing UIViewController. Tauri's
    // Plugin base exposes `manager` as a non-optional `PluginManager`, but its
    // `viewController` accessor may be nil in edge cases (no scene yet, or the
    // plugin instantiated before the webview is attached). Fall back to the key
    // window's root VC.
    @MainActor
    private var topViewController: UIViewController? {
        if let vc = self.manager.viewController { return vc }
        return UIApplication.shared.connectedScenes
            .compactMap { $0 as? UIWindowScene }
            .flatMap(\.windows)
            .first(where: \.isKeyWindow)?
            .rootViewController
    }

    // Emit rewarded readiness to the webview. The JS provider mirrors `ready`
    // into a Vue ref that gates every ad affordance, so a "watch ad" prompt
    // never appears unless an ad is actually loaded and tappable.
    //
    // Two literal-dict call sites instead of a `[String: Any]` payload —
    // Tauri's `trigger(_:data:)` expects a JSObject ([String: JSValue]), which
    // Swift can synthesize from a homogeneous literal but not from a runtime
    // `[String: Any]`.
    private func emitReadiness(_ ready: Bool, error: String? = nil) {
        if let error = error {
            self.trigger("rewarded-state", data: ["ready": ready, "error": error])
        } else {
            self.trigger("rewarded-state", data: ["ready": ready])
        }
    }

    @objc public func initialize(_ invoke: Invoke) throws {
        let args = try invoke.parseArgs(InitArgs.self)
        rewardedAdUnitId = args.rewardedAdUnitId
        designedForFamilies = args.designedForFamilies

        let config = MobileAds.shared.requestConfiguration
        let childDirected = args.tagForChildDirectedTreatment

        // ── Families / COPPA request configuration — BEFORE SDK start ──────
        config.tagForChildDirectedTreatment = childDirected
        // TFCD wins: never send both. See the class doc.
        config.tagForUnderAgeOfConsent = (!childDirected && args.tagForUnderAgeOfConsent)
        config.maxAdContentRating = Self.contentRating(from: args.maxAdContentRating)
        // No personalized advertising for a kids title, independent of any
        // consent flow — there is no consent to collect from a child.
        config.publisherPrivacyPersonalizationState = .disabled

        // `useTestAds` is honoured on the JS side instead of here: the provider
        // swaps in Google's documented rewarded-interstitial test ad unit ID
        // (ca-app-pub-3940256099942544/6978759866). That mechanism is
        // SDK-version-proof and needs no device registration, unlike
        // `testDeviceIdentifiers`.

        MobileAds.shared.start { [weak self] _ in
            guard let self = self else { return }
            self.initialized = true
            invoke.resolve(["initialized": true])
            self.loadRewarded()
        }
    }

    private static func contentRating(from raw: String) -> GADMaxAdContentRating {
        switch raw.uppercased() {
        case "G": return GADMaxAdContentRating.general
        case "PG": return GADMaxAdContentRating.parentalGuidance
        case "T": return GADMaxAdContentRating.teen
        case "MA": return GADMaxAdContentRating.matureAudience
        // Anything unrecognised falls back to the strictest tier rather than
        // silently widening the inventory on a kids title.
        default: return GADMaxAdContentRating.general
        }
    }

    private func buildRequest() -> Request {
        let request = Request()
        if designedForFamilies {
            // Designed for Families signal. Narrows the eligible inventory to
            // the DFF-approved subset on top of the child-directed tagging
            // already applied through requestConfiguration.
            let extras = Extras()
            extras.additionalParameters = ["is_designed_for_families": true]
            request.register(extras)
        }
        return request
    }

    private func loadRewarded() {
        guard initialized, !rewardedAdUnitId.isEmpty, !isLoading, rewardedAd == nil else { return }
        isLoading = true

        RewardedInterstitialAd.load(
            with: rewardedAdUnitId,
            request: buildRequest()
        ) { [weak self] ad, error in
            guard let self = self else { return }
            self.isLoading = false
            if let error = error {
                self.rewardedAd = nil
                self.emitReadiness(false, error: error.localizedDescription)
                return
            }
            guard let ad = ad else {
                self.rewardedAd = nil
                self.emitReadiness(false, error: "load-failed")
                return
            }
            ad.fullScreenContentDelegate = self
            self.rewardedAd = ad
            self.emitReadiness(true)
        }
    }

    @objc public func showRewarded(_ invoke: Invoke) throws {
        guard initialized else { return resolveShowFailure(invoke, "not-initialized") }
        guard !rewardedAdUnitId.isEmpty else { return resolveShowFailure(invoke, "not-configured") }
        guard let ad = rewardedAd else {
            loadRewarded()
            return resolveShowFailure(invoke, "no-fill")
        }
        guard pendingRewarded == nil else { return resolveShowFailure(invoke, "already-showing") }

        pendingRewarded = invoke
        lastRewardGranted = false

        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }
            guard let vc = self.topViewController else {
                self.pendingRewarded = nil
                self.resolveShowFailure(invoke, "no-view-controller")
                return
            }
            ad.present(from: vc) { [weak self] in
                // Reward earned. The promise still resolves from the dismiss
                // delegate so the game never grants coins over a live ad.
                self?.lastRewardGranted = true
            }
        }
    }

    private func resolveShowFailure(_ invoke: Invoke, _ reason: String) {
        invoke.resolve(["shown": false, "rewarded": false, "error": reason])
    }

    // ── FullScreenContentDelegate ────────────────────────────────────────

    func adDidDismissFullScreenContent(_ ad: FullScreenPresentingAd) {
        let pending = pendingRewarded
        pendingRewarded = nil
        let granted = lastRewardGranted
        lastRewardGranted = false
        rewardedAd = nil

        pending?.resolve(["shown": true, "rewarded": granted])

        // Ad consumed -> not ready until the next load lands.
        emitReadiness(false)
        loadRewarded()
    }

    func ad(_ ad: FullScreenPresentingAd, didFailToPresentFullScreenContentWithError error: Error) {
        let pending = pendingRewarded
        pendingRewarded = nil
        lastRewardGranted = false
        rewardedAd = nil

        pending?.resolve([
            "shown": false,
            "rewarded": false,
            "error": error.localizedDescription
        ])

        emitReadiness(false, error: error.localizedDescription)
        loadRewarded()
    }
}

@_cdecl("init_plugin_admob")
func initPlugin() -> Plugin {
    return AdMobPlugin()
}
