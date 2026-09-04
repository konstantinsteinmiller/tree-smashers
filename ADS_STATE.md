# Native ads — state of play

**Status: code complete, blocked on two AdMob ad units.**
Last updated 2026-09-03.

This file is the cross-session source of truth for the Google Play Families
rejection and the AdMob-only rebuild. Read it before touching anything under
`src-tauri/plugins/tauri-plugin-admob/`, `src/use/ads/`, or the ad env vars.

---

## 1. What happened

Google Play rejected **com.chaos.arena**, version codes **1000012** and
**1000020**, under *Families Ad Format Requirements*:

> **Unclosable ads:** Ads interfere with app use and can't be closed after 5 seconds.
> **Unclear ads/offers:** Ads or in-app purchase offers aren't clearly different
> from your app's content (for example, unlabeled ads or ads that look like the game).

The root cause was the ad stack, not a single creative:

- The native build ran **Unity LevelPlay (ironSource) mediation** with AdMob and
  Unity Ads bidders. In a waterfall the publisher has no control over the
  winning creative's close affordance.
- The one format shipped was a **standard rewarded video**, which is
  non-skippable by design. Play's Families policy is explicit that ads
  interfering with normal app use — *"including rewarded or opt-in ads"* — must
  be closeable after 5 seconds. Being opt-in is not an exemption.
- `AdRewardButton` showed only a film-reel glyph with no "Ad" word, which is
  what the *unclear ads* half of the notice points at.

Note for later: ironSource ≥ 7.2.1 and Unity Ads ≥ 4.0.1 *are* on the Families
Self-Certified Ads SDK list. The SDKs were never the problem — the **format**
was. Re-adding mediation without per-network format controls will fail again.

## 2. What the code does now

Direct **Google AdMob**, no mediation, exactly one ad format.

| Piece                                 | Where                                            |
|---------------------------------------|--------------------------------------------------|
| Native plugin (Kotlin + Swift + Rust) | `src-tauri/plugins/tauri-plugin-admob/`          |
| JS provider                           | `src/use/ads/AdMobProvider.ts`                   |
| Intro-screen gate                     | `src/use/useRewardedIntro.ts`                    |
| Intro screen UI (8 locales)           | `src/components/atoms/RewardedAdIntroModal.vue`  |
| On-device debug HUD                   | `src/components/atoms/NativeAdsDebugOverlay.vue` |
| Tests                                 | `tests/rewardedIntroGate.test.ts`                |

The compliance-critical decisions, and why each one is what it is:

1. **Rewarded *interstitial* ad units only.** Google serves *skippable*
   creatives exclusively into rewarded-interstitial units. That is the whole
   reason for choosing this format over a plain rewarded unit — it is what
   makes the ad closeable inside 5 seconds. A plain "Rewarded" unit is the
   wrong one and will re-trigger the rejection.
2. **No interstitial code path at all.** `show_interstitial` does not exist as
   a command in the native plugin, `showMidgameAd()` is a logged no-op, and
   `isInterstitialReady` is a permanently-false ref. A decompiler finds no
   interstitial loader in the APK.
3. **TFCD only, never TFCD + TFUA.** Google's targeting guide says the two
   "shouldn't both simultaneously be set to true". The old LevelPlay config set
   both. `resolveTfua()` (Kotlin) and the equivalent Swift line force TFUA to
   UNSPECIFIED whenever TFCD is on.
4. **`maxAdContentRating = "G"`**, with an unrecognised value falling back to
   `G` rather than widening inventory.
5. **`is_designed_for_families=true`** on every request, via the
   `AdMobAdapter` extras bundle.
6. **Request configuration is applied before `MobileAds.initialize`**, so no
   request can leave the device untagged.
7. **Manifest strips `AD_ID`** and all three Privacy Sandbox ad permissions.
8. **Intro screen before every rewarded ad** (native only). Required by AdMob's
   rewarded-interstitial contract *and* answers the "unclear ads" finding: the
   card leads with the word **Advertisement** and offers an equal-weight
   "No thanks". Triggered from the single seam `useAds.showRewardedAd()`, so
   every present and future placement inherits it.
9. **`AdRewardButton` now carries the "Ad" text label** on native, matching
   `RewardedAdButton` and `RouletteWheel`.

What is *physically absent* from the build: `src-tauri/Cargo.toml` no longer
depends on `tauri-plugin-levelplay`, so the Tauri CLI leaves it out of the
generated `gen/android/tauri.settings.gradle` and neither ironSource nor Unity
Ads reaches the APK/AAB. The plugin source and `LevelPlayProvider.ts` stay on
disk as reference, both carrying DISABLED banners.

## 3. Blocking manual steps

Nothing else ships until these are done. While the ad unit IDs are empty the
game runs **with no ads at all** — a safe state to submit, just unmonetised.

- [ ] **AdMob console → Chaos Arena (Android, app ID
  `ca-app-pub-4823250874530748~3774407282`) → Ad units → Add ad unit →
  _Rewarded interstitial_.** Copy the unit ID (slash separator) into
  `VITE_APP_ADMOB_ANDROID_REWARDED_INTERSTITIAL_ID` in `.env.tauri`.
- [ ] **Same for the iOS app** (`ca-app-pub-4823250874530748~1807322131`) →
  `VITE_APP_ADMOB_IOS_REWARDED_INTERSTITIAL_ID` in `.env.tauri`, **and** as
  a GitHub Actions repository *variable* of the same name (Settings →
  Secrets and variables → Actions → Variables) for the iOS CI build.
- [ ] **Play Console → App content → Target audience and content:** confirm the
  declared audience still includes children, and that the ads declaration
  is present.
- [ ] **LevelPlay / Unity dashboard:** pause the ironSource and Unity Ads
  networks for this app. Belt and braces — the SDKs are gone from the
  binary, but a live dashboard config invites a future accident.

## 4. Verifying before upload

- [ ] `pnpm type-check && pnpm test` (4 failures are pre-existing and unrelated:
  two in `useBgSkins`, one price-format, one `keys` test).
- [ ] Build a debug APK with `VITE_APP_ADS_TEST_ADS=true` and confirm on device:
  intro modal appears → ad plays → **a close/skip control appears within
  ~5 seconds** → closing early grants nothing, watching through grants the
  reward. The debug HUD (top-right, `VITE_APP_DEBUG=true`) shows init state
  and a TEST ADS warning.
- [ ] Set `VITE_APP_ADS_TEST_ADS=false` before the release build. Test
  creatives in a store build read as invalid traffic.
- [ ] Confirm the release AAB contains no ironSource/Unity classes:
  `unzip -l <aab> | grep -iE "ironsource|unity3d"` → expect no matches.
- [ ] `versionCode` auto-bumps via `scripts/bump-android-version-code.mjs`
  (`.env.tauri.remote`, currently past 1000022). It must exceed every code
  ever uploaded, including the rejected 1000012 / 1000020.

## 5. Only after Play ACCEPTS this build

The user's plan is to re-attempt other networks once a compliant build is
live. Do not start before acceptance, and treat it as its own review:

1. Re-add the mediation dependency and the Cargo dep, then verify **per network**
   that the format served is skippable-after-5s for child-directed traffic.
   Network-side controls, not just our tagging.
2. Keep the rewarded-interstitial unit as the AdMob-side format.
3. Keep every item in section 2 — none of it is mediation-specific.
4. Re-verify the app still uses only Families Self-Certified Ads SDKs at the
   versions on Google's list.

## 6. iOS notes

`.github/workflows/ios-build.yml` lost ~150 lines of IronSource-specific
machinery: the xcframework pre-download for IronSource + ISAdMobAdapter, the
Swift 5.x compatibility-library staging (IronSource 9.4.0 was built with an old
toolchain), and the `-force_load` link patching. What remains is one
GoogleMobileAds xcframework staged under `ci-frameworks/` plus a
`-framework GoogleMobileAds` link patch — still needed because SPM feeds the
compile step but does not merge the framework into `libapp.a`.

`AdMobPlugin.swift` is written against Google Mobile Ads iOS **13.2.0** (the
v12+ generation where the `GAD` prefix was dropped from most types).
`GADMaxAdContentRating` keeps its prefix. The version is pinned `exact:` in
`ios/Package.swift` and must match the zip URL in the CI download step. Nothing
in the iOS path has been compiled yet — the next TestFlight run is its first
real test.
