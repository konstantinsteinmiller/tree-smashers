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
import com.google.android.gms.ads.OnUserEarnedRewardListener
import com.google.android.gms.ads.RequestConfiguration
import com.google.android.gms.ads.rewarded.RewardedAd
import com.google.android.gms.ads.rewarded.RewardedAdLoadCallback
import com.google.android.gms.ads.rewardedinterstitial.RewardedInterstitialAd
import com.google.android.gms.ads.rewardedinterstitial.RewardedInterstitialAdLoadCallback

// JS -> native payload for the init command. Shape matches
// `models::InitRequest` on the Rust side; Tauri auto-deserializes.
@InvokeArg
class InitArgs {
    var rewardedAdUnitId: String = ""
    var adFormat: String = "rewarded_interstitial"
    var tagForChildDirectedTreatment: Boolean = true
    var tagForUnderAgeOfConsent: Boolean = false
    var maxAdContentRating: String = "G"
    var designedForFamilies: Boolean = true
    var useTestAds: Boolean = false
}

// Google AdMob (Google Mobile Ads SDK) integration for Tauri, for an app that
// is reviewed under Google Play's Families Ad Format Requirements.
//
// ## Formats
//
// The plugin holds ONE opt-in rewarded ad at a time, in the AdMob format the
// init payload names:
//
//   • `rewarded_interstitial` (default) — a "Rewarded interstitial" ad unit
//   • `rewarded`                        — a plain "Rewarded" ad unit
//
// The two are loaded through different SDK classes, and a unit of one type
// fails to load through the other. There is no interstitial / banner /
// app-open / native-ad code path, so no build can show an ad the player did
// not ask for.
//
// The caller (JS) owns the opt-in: an intro screen naming the reward with a
// visible decline option, shown BEFORE `showRewarded` is invoked. See
// `RewardedAdIntroModal.vue`.
//
// ## What this file can NOT guarantee
//
// Families requires an ad to be closeable after 5 seconds. Whether it is, is
// decided by the creative template Google's server picks for the impression —
// not by the format, not by the request tags and not by anything here.
// Measured 2026-10-02 (ADS_STATE.md): the rewarded-interstitial unit served
// two-ad pods whose first close button appeared 17–36 s in, tagged TFCD or
// TFUA alike. That is what got version code 1000024 rejected. Before a build
// with ads enabled is uploaded, `tools/ad-closeability/measure.mjs` has to
// pass on the real ad unit.
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
//   4. Every ad is shown NON-immersive. Left alone, the SDK hides the
//      navigation bar, and the first time any window does that on a device
//      Android slides in its "Viewing full screen" panel — over the top
//      quarter of the screen, which is where the ad's close button lives, and
//      it stays until tapped. The game itself never goes immersive, so on a
//      freshly set up device that panel landed on the very first ad.
//
// A single `Invoke` is parked in `pendingRewarded` for the duration of a show
// and resolved exactly once, from either `onAdDismissedFullScreenContent` or
// `onAdFailedToShowFullScreenContent`, so a second concurrent show can never
// cross-resolve an earlier caller's promise.
@TauriPlugin
class AdMobPlugin(private val activity: Activity) : Plugin(activity) {

    // The ad that is loaded and waiting, in whichever format the unit is. The
    // two SDK classes share no supertype, so the one call the rest of this
    // class needs from them is captured here.
    private class LoadedAd(val show: (Activity, OnUserEarnedRewardListener) -> Unit)

    private var initialized = false
    private var rewardedAdUnitId: String = ""
    private var adFormat: String = FORMAT_REWARDED_INTERSTITIAL
    private var designedForFamilies = true

    private var loadedAd: LoadedAd? = null
    private var isLoading = false

    private var pendingRewarded: Invoke? = null
    // `onUserEarnedReward` fires before `onAdDismissedFullScreenContent`. We
    // latch it here and resolve on dismiss, so the caller learns both that the
    // ad finished AND whether the reward was actually earned. A player who
    // closes the ad early dismisses without earning — `rewarded` stays false
    // and no reward is granted. That is the intended, policy-compliant path.
    private var lastRewardGranted = false

    override fun load(webView: WebView) {
        super.load(webView)
    }

    @Command
    fun initialize(invoke: Invoke) {
        val args = invoke.parseArgs(InitArgs::class.java)
        rewardedAdUnitId = args.rewardedAdUnitId
        // Anything unrecognised falls back to the default format rather than
        // failing the init: a wrong pairing surfaces as a load error on the
        // debug HUD, with ads simply staying off.
        adFormat = if (args.adFormat == FORMAT_REWARDED) FORMAT_REWARDED else FORMAT_REWARDED_INTERSTITIAL

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
            // Legacy Designed for Families extra. SDK 24.9 no longer puts it
            // on the wire (the request carries `tfcd` and
            // `max_ad_content_rating` only), so nothing may depend on it; it
            // is kept because it is harmless and older SDKs honoured it.
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
        if (!initialized || rewardedAdUnitId.isEmpty() || isLoading || loadedAd != null) return
        isLoading = true
        activity.runOnUiThread {
            if (adFormat == FORMAT_REWARDED) {
                RewardedAd.load(
                    activity,
                    rewardedAdUnitId,
                    buildAdRequest(),
                    object : RewardedAdLoadCallback() {
                        override fun onAdLoaded(ad: RewardedAd) {
                            ad.fullScreenContentCallback = fullScreenCallback
                            ad.setImmersiveMode(false)
                            onLoaded(LoadedAd { host, listener -> ad.show(host, listener) })
                        }

                        override fun onAdFailedToLoad(error: LoadAdError) = onLoadFailed(error)
                    }
                )
            } else {
                RewardedInterstitialAd.load(
                    activity,
                    rewardedAdUnitId,
                    buildAdRequest(),
                    object : RewardedInterstitialAdLoadCallback() {
                        override fun onAdLoaded(ad: RewardedInterstitialAd) {
                            ad.fullScreenContentCallback = fullScreenCallback
                            ad.setImmersiveMode(false)
                            onLoaded(LoadedAd { host, listener -> ad.show(host, listener) })
                        }

                        override fun onAdFailedToLoad(error: LoadAdError) = onLoadFailed(error)
                    }
                )
            }
        }
    }

    private fun onLoaded(ad: LoadedAd) {
        isLoading = false
        loadedAd = ad
        emitReadiness(true)
    }

    private fun onLoadFailed(error: LoadAdError) {
        isLoading = false
        loadedAd = null
        emitReadiness(false, error.message ?: "load-failed")
    }

    private val fullScreenCallback = object : FullScreenContentCallback() {
        override fun onAdDismissedFullScreenContent() {
            val pending = pendingRewarded
            pendingRewarded = null
            val granted = lastRewardGranted
            lastRewardGranted = false
            loadedAd = null

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
            loadedAd = null

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
        val ad = loadedAd
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
            // Reward earned. The player watched far enough for Google to
            // credit it; the promise still resolves from the dismiss callback
            // so the game never grants coins over a live ad.
            ad.show(activity, OnUserEarnedRewardListener { lastRewardGranted = true })
        }
    }

    private fun resolveShowFailure(invoke: Invoke, reason: String) {
        val obj = JSObject()
        obj.put("shown", false)
        obj.put("rewarded", false)
        obj.put("error", reason)
        invoke.resolve(obj)
    }

    private companion object {
        const val FORMAT_REWARDED_INTERSTITIAL = "rewarded_interstitial"
        const val FORMAT_REWARDED = "rewarded"
    }
}
