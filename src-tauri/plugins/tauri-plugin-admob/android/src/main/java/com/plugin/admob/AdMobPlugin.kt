package com.plugin.admob

import android.app.Activity
import android.os.Bundle
import android.webkit.WebView
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin
import com.google.ads.mediation.admob.AdMobAdapter
import com.google.android.gms.ads.AdError
import com.google.android.gms.ads.AdRequest
import com.google.android.gms.ads.FullScreenContentCallback
import com.google.android.gms.ads.LoadAdError
import com.google.android.gms.ads.MobileAds
import com.google.android.gms.ads.RequestConfiguration
import com.google.android.gms.ads.rewardedinterstitial.RewardedInterstitialAd
import com.google.android.gms.ads.rewardedinterstitial.RewardedInterstitialAdLoadCallback

// JS -> native payload for the init command. Shape matches
// `models::InitRequest` on the Rust side; Tauri auto-deserializes.
@InvokeArg
class InitArgs {
    var rewardedAdUnitId: String = ""
    var tagForChildDirectedTreatment: Boolean = true
    var tagForUnderAgeOfConsent: Boolean = false
    var maxAdContentRating: String = "G"
    var designedForFamilies: Boolean = true
    var useTestAds: Boolean = false
}

// Google AdMob (Google Mobile Ads SDK) integration for Tauri, built to satisfy
// Google Play's Families Ad Format Requirements.
//
// ## The one format
//
// This plugin can load and show exactly one thing: a **rewarded interstitial**
// ad unit. Google serves skippable creatives exclusively into rewarded
// interstitial units, which is what makes the ad closeable well inside the
// 5-second Families limit. There is no interstitial / banner / app-open /
// native-ad code path here, so no build of this app can accidentally show a
// format that fails review.
//
// The caller (JS) is responsible for the second half of the rewarded
// interstitial contract: an intro screen naming the reward with a visible
// decline option, shown BEFORE `showRewarded` is invoked. See
// `RewardedAdIntroModal.vue`.
//
// ## Ordering rules
//
//   1. `MobileAds.setRequestConfiguration(...)` MUST run BEFORE
//      `MobileAds.initialize(...)`. Configuration set afterwards does not
//      retroactively tag requests that the SDK has already begun preparing.
//
//   2. TFCD and TFUA must never both be true — Google's targeting guide is
//      explicit that they "shouldn't both simultaneously be set to true".
//      `resolveTfua` below forces TFUA to UNSPECIFIED whenever TFCD is on.
//
//   3. Ad loads and shows must happen on the UI thread; SDK initialization
//      should not (it does disk + network work). Hence the background thread
//      for init and `runOnUiThread` for everything else.
//
// A single `Invoke` is parked in `pendingRewarded` for the duration of a show
// and resolved exactly once, from either `onAdDismissedFullScreenContent` or
// `onAdFailedToShowFullScreenContent`, so a second concurrent show can never
// cross-resolve an earlier caller's promise.
@TauriPlugin
class AdMobPlugin(private val activity: Activity) : Plugin(activity) {

    private var initialized = false
    private var rewardedAdUnitId: String = ""
    private var designedForFamilies = true

    private var rewardedAd: RewardedInterstitialAd? = null
    private var isLoading = false

    private var pendingRewarded: Invoke? = null
    // `onUserEarnedReward` fires before `onAdDismissedFullScreenContent`. We
    // latch it here and resolve on dismiss, so the caller learns both that the
    // ad finished AND whether the reward was actually earned. A player who
    // uses the skip button dismisses without earning — `rewarded` stays false
    // and no reward is granted. That is the intended, policy-compliant path.
    private var lastRewardGranted = false

    override fun load(webView: WebView) {
        super.load(webView)
    }

    @Command
    fun initialize(invoke: Invoke) {
        val args = invoke.parseArgs(InitArgs::class.java)
        rewardedAdUnitId = args.rewardedAdUnitId

        // ── Families / COPPA request configuration — BEFORE SDK init ──────
        val childDirected = args.tagForChildDirectedTreatment
        val configBuilder = RequestConfiguration.Builder()
            .setTagForChildDirectedTreatment(
                if (childDirected) {
                    RequestConfiguration.TAG_FOR_CHILD_DIRECTED_TREATMENT_TRUE
                } else {
                    RequestConfiguration.TAG_FOR_CHILD_DIRECTED_TREATMENT_UNSPECIFIED
                }
            )
            .setTagForUnderAgeOfConsent(resolveTfua(childDirected, args.tagForUnderAgeOfConsent))
            .setMaxAdContentRating(resolveContentRating(args.maxAdContentRating))

        if (args.useTestAds) {
            // Emulators are always test devices; adding the constant keeps
            // `useTestAds` meaningful on a physical device running a debug
            // build without hardcoding a hashed device ID here.
            configBuilder.setTestDeviceIds(listOf(AdRequest.DEVICE_ID_EMULATOR))
        }

        MobileAds.setRequestConfiguration(configBuilder.build())

        designedForFamilies = args.designedForFamilies

        // SDK init touches disk and the network; Google's own guidance is to
        // keep it off the main thread so the first frame is not blocked.
        Thread {
            MobileAds.initialize(activity) {
                initialized = true
                val res = JSObject()
                res.put("initialized", true)
                invoke.resolve(res)
                loadRewarded()
            }
        }.start()
    }

    // TFCD wins. Google's targeting guide forbids setting both to true, and
    // a child-directed declaration is the stronger, COPPA-anchored signal.
    private fun resolveTfua(childDirected: Boolean, requested: Boolean): Int =
        if (!childDirected && requested) {
            RequestConfiguration.TAG_FOR_UNDER_AGE_OF_CONSENT_TRUE
        } else {
            RequestConfiguration.TAG_FOR_UNDER_AGE_OF_CONSENT_UNSPECIFIED
        }

    private fun resolveContentRating(raw: String): String = when (raw.uppercase()) {
        "G" -> RequestConfiguration.MAX_AD_CONTENT_RATING_G
        "PG" -> RequestConfiguration.MAX_AD_CONTENT_RATING_PG
        "T" -> RequestConfiguration.MAX_AD_CONTENT_RATING_T
        "MA" -> RequestConfiguration.MAX_AD_CONTENT_RATING_MA
        // Anything unrecognised falls back to the strictest tier rather than
        // silently widening the inventory on a kids title.
        else -> RequestConfiguration.MAX_AD_CONTENT_RATING_G
    }

    private fun buildAdRequest(): AdRequest {
        val builder = AdRequest.Builder()
        if (designedForFamilies) {
            // Designed for Families signal. Narrows the eligible inventory to
            // the DFF-approved subset on top of the child-directed tagging
            // already applied through RequestConfiguration.
            val extras = Bundle()
            extras.putBoolean("is_designed_for_families", true)
            builder.addNetworkExtrasBundle(AdMobAdapter::class.java, extras)
        }
        return builder.build()
    }

    // Emit rewarded readiness to the webview. The JS provider mirrors `ready`
    // into a Vue ref that gates every ad affordance, so a "watch ad" prompt
    // never appears unless an ad is actually loaded and tappable.
    private fun emitReadiness(ready: Boolean, error: String? = null) {
        val obj = JSObject()
        obj.put("ready", ready)
        if (error != null) obj.put("error", error)
        trigger("rewarded-state", obj)
    }

    private fun loadRewarded() {
        if (!initialized || rewardedAdUnitId.isEmpty() || isLoading || rewardedAd != null) return
        isLoading = true
        activity.runOnUiThread {
            RewardedInterstitialAd.load(
                activity,
                rewardedAdUnitId,
                buildAdRequest(),
                object : RewardedInterstitialAdLoadCallback() {
                    override fun onAdLoaded(ad: RewardedInterstitialAd) {
                        isLoading = false
                        ad.fullScreenContentCallback = fullScreenCallback
                        rewardedAd = ad
                        emitReadiness(true)
                    }

                    override fun onAdFailedToLoad(error: LoadAdError) {
                        isLoading = false
                        rewardedAd = null
                        emitReadiness(false, error.message ?: "load-failed")
                    }
                }
            )
        }
    }

    private val fullScreenCallback = object : FullScreenContentCallback() {
        override fun onAdDismissedFullScreenContent() {
            val pending = pendingRewarded
            pendingRewarded = null
            val granted = lastRewardGranted
            lastRewardGranted = false
            rewardedAd = null

            val obj = JSObject()
            obj.put("shown", true)
            obj.put("rewarded", granted)
            pending?.resolve(obj)

            // Ad consumed -> not ready until the next load lands.
            emitReadiness(false)
            loadRewarded()
        }

        override fun onAdFailedToShowFullScreenContent(error: AdError) {
            val pending = pendingRewarded
            pendingRewarded = null
            lastRewardGranted = false
            rewardedAd = null

            val obj = JSObject()
            obj.put("shown", false)
            obj.put("rewarded", false)
            obj.put("error", error.message ?: "show-failed")
            pending?.resolve(obj)

            emitReadiness(false, error.message ?: "show-failed")
            loadRewarded()
        }

        override fun onAdShowedFullScreenContent() {}
        override fun onAdImpression() {}
        override fun onAdClicked() {}
    }

    @Command
    fun showRewarded(invoke: Invoke) {
        if (!initialized) {
            resolveShowFailure(invoke, "not-initialized")
            return
        }
        if (rewardedAdUnitId.isEmpty()) {
            resolveShowFailure(invoke, "not-configured")
            return
        }
        val ad = rewardedAd
        if (ad == null) {
            loadRewarded()
            resolveShowFailure(invoke, "no-fill")
            return
        }
        if (pendingRewarded != null) {
            resolveShowFailure(invoke, "already-showing")
            return
        }

        pendingRewarded = invoke
        lastRewardGranted = false
        activity.runOnUiThread {
            ad.show(activity) { _ ->
                // Reward earned. The player watched far enough for Google to
                // credit it; the promise still resolves from the dismiss
                // callback so the game never grants coins over a live ad.
                lastRewardGranted = true
            }
        }
    }

    private fun resolveShowFailure(invoke: Invoke, reason: String) {
        val obj = JSObject()
        obj.put("shown", false)
        obj.put("rewarded", false)
        obj.put("error", reason)
        invoke.resolve(obj)
    }
}
