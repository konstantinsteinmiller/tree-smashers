# Native ads — state of play

**Status: Tree Smashers on Android and iOS is an 18+ title (not designed for
children) and monetises through Unity LevelPlay mediation — ironSource Ads,
Google AdMob and Unity Ads as bidders (iOS: ironSource + AdMob). Android 1.3.0
went to Play review on 2026-10-03; the iOS build is configured but untested.**
Last updated 2026-10-03.

This file is the cross-session source of truth for native ads and the Google
Play declarations that go with them. Read it before touching
`src-tauri/plugins/tauri-plugin-levelplay/`, `src/use/ads/`, the ad env vars
or the Play Console *App content* pages.

---

## 1. History

| When | What | Result |
|---|---|---|
| 2026-09-03 | 1000012 / 1000020 — LevelPlay mediation, app declared for ages 6–17 + 18+ (Families policy applied) | Rejected: *Families ad format requirements* (unclosable ads, unclear ads) |
| 2026-09-09 | 1000024 — direct AdMob rewarded interstitial, child-directed | Rejected again, same findings |
| 2026-10-02 | 1000024's ads measured on an emulator (`tools/ad-closeability/`) | AdMob served two-ad pods with no close control for 17–36 s whatever the request tags said — Families-compliant ads could not be guaranteed |
| 2026-10-03 | Decision: leave the Families programme. Target audience **18+ only**, back to LevelPlay with three networks | 1.3.0 (1000026/1000027) submitted |

With 18+ as the only target age group the Families policy (and its 5-second
close rule) does not apply. The plain Google Play Ads policy still does: ads
must be clearly ads, and must not imitate the game UI.

## 2. What the code does

| Piece | Where |
|---|---|
| Native plugin (Kotlin + Rust; Swift for iOS) | `src-tauri/plugins/tauri-plugin-levelplay/` |
| JS provider | `src/use/ads/LevelPlayProvider.ts` (picked in `src/platforms/resolveAdProvider.ts`) |
| Release gate | `scripts/native-ads-gate.mjs` (runs inside `pnpm tauri:build-android-aab`) |
| On-device debug HUD | `src/components/atoms/LevelPlayDebugOverlay.vue` (debug builds only) |
| In-app privacy links | Options → General: *Privacy Policy* (always on native) and *Privacy Settings* (when the consent SDK says it is required) |

- **SDKs** (`android/build.gradle.kts`): LevelPlay mediation 9.6.0; AdMob
  adapter 5.5.0 + Google Mobile Ads **24.9.0** (25.x needs Kotlin 2.3 metadata,
  this project compiles with Kotlin 2.1); Unity Ads adapter 5.13.0 + Unity Ads
  4.20.1; Google UMP 3.2.0. Only those three networks are in the dex —
  AppLovin / Mintegral / Pangle / Vungle appear only as name references inside
  the ironSource SDK (0 class definitions, checked on the release bundle).
- **Not child-directed.** `VITE_APP_ADS_CHILD_DIRECTED=false` →
  `LevelPlayPrivacySettings.setCOPPA(false)`, `is_deviceid_optout=false`,
  interstitials allowed, no rewarded-intro screen. The manifest carries
  `com.google.android.gms.permission.AD_ID`.
- **Consent (EEA / UK / CH).** Before `LevelPlay.init` the plugin runs Google
  UMP: `requestConsentInfoUpdate` → `loadAndShowConsentFormIfRequired`. LevelPlay
  reads the stored TCF string for every network. Any UMP error falls through to
  init, so ads never block on consent.
- **Release gate** blocks: child-directed builds with ads on, the LevelPlay test
  suite, the UMP debug geography, the debug HUD, empty LevelPlay app key / ad
  units, a missing or test AdMob app ID, a missing privacy policy URL.
- **External links** go through `src/utils/openExternal.ts` →
  `tauri-plugin-opener`. Not `tauri-plugin-shell`: its JS `open()` runs the
  desktop `open` crate and silently does nothing on Android (that is why the
  privacy link was dead in 1000026).
- The old direct-AdMob plugin (`src-tauri/plugins/tauri-plugin-admob/`) stays
  on disk but is not a dependency, so none of it ships.

## 3. Store and console setup (done 2026-10-03)

**Play Console — App content**

- Target audience: **18 and over only** (the "appeals to children" questions
  are not asked for 18+). Optional "restrict minor access" left off.
- Contains ads: yes. Advertising ID: yes — analytics, advertising, fraud
  prevention.
- Privacy policy: `https://konstantinsteinmiller.github.io/privacy/tree-smashers/`
  (EN + DE, source in the portfolio repo `public/privacy/tree-smashers/`).
- Data safety — encrypted in transit, no accounts, deletion on request via
  `…/privacy/tree-smashers/index.html#delete`:

  | Data type | Collected | Shared | Why (collected / shared) |
  |---|---|---|---|
  | Approximate location | yes | yes | functionality, analytics, ads, fraud / same |
  | Name (leaderboard display name) | yes | no | functionality |
  | User IDs | yes | yes | functionality / functionality |
  | App interactions | yes | yes | analytics, ads, fraud / same |
  | Other actions (scores, ad interactions) | yes | yes | functionality, analytics, ads, fraud / analytics, ads, fraud |
  | Diagnostics | yes | yes | functionality, analytics, ads, fraud / same |
  | Device or other IDs | yes | yes | functionality, analytics, ads, fraud / same |

  Sources: LevelPlay, AdMob and Unity Ads data-safety guides, plus the game's
  own leaderboard (`useLiveLeaderboard.ts` posts player ID, name, score, power,
  team build). Unity also lists "purchase history"; not declared because the
  app has no purchases.

**Tracks** — production, closed testing and open testing (paused) each carry a
1.3.0 release; every old bundle (1000011, 1000019, 1000024) is replaced.
Releases were saved with "roll out without permission" on the AD_ID warning:
that warning is about the *old* artifacts, the new bundle has the permission.

**AdMob** — GDPR message "Tree Smashers GDPR" published for both apps (Android
and iOS, EEA/UK/CH, 25 languages, Consent / Do not consent / Manage options).
The ad-partner list is Google's "commonly used" set and already includes
ironSource Mobile and Unity Ads. Verified on the Android release build from
Germany: the form shows, LevelPlay starts after it, Options → Privacy Settings
reopens it.

**Unity dashboard** — the Unity Ads apps behind both LevelPlay app keys
(Android game ID 6099703, iOS game ID 6099746) were marked "directed to
children, no mixed audience", which switches personalised Unity ads off. Both
now say "general audience app that is not directed to children" (2026-10-03).
The older "Tree Smashers" Unity project (game IDs 6099658/6099659) is not used by
any build and was left alone.

**Portfolio site** — GitHub Pages now deploys only from the repo's
`static.yaml` workflow (source: GitHub Actions). It used to also run the legacy
branch build from `master:/docs` (a 2025 snapshot), which won the race on some
pushes and took the privacy page and `app-ads.txt` offline. Note the repo's
default branch is `develop`: a manual "Run workflow" deploys `develop` unless
you pick `master`.

## 4. Still open

- [ ] After Play approval: **AdMob → Apps → Tree Smashers (Android) → Add
      store** → link `com.tree.smashers`. Until then AdMob shows "ad serving
      limited". Not possible before the app is public (checked 2026-10-03:
      Play page 404, App Store lookup empty). Same for iOS once it is live.
- [ ] LevelPlay mediation dashboard (platform.ironsrc.com — its own sign-in):
      check the app settings carry no child-directed / COPPA flag. The
      emulator's test suite already showed ironSource, AdMob and Unity Ads
      bidding on both units.
- [ ] Live fill on a real phone (an emulator gets "509 no fill" on live demand;
      the LevelPlay test suite loaded AdMob test ads fine).
- [ ] **iOS (18+ since 2026-10-03, untested — no Mac here):** the CI build sets
      `VITE_APP_ADS_CHILD_DIRECTED=false` and the privacy URL; the Swift
      plugin runs UMP consent before LevelPlay and has `showPrivacyOptions`,
      all behind `#if canImport(UserMessagingPlatform)`. UMP only reaches the
      plugin transitively through the GoogleMobileAds SPM package, and the CLI
      SPM build may not expose it (Package.swift explains the same bug for
      IronSource). **Check the CI log for the warning "UserMessagingPlatform is
      not importable"** — if it is there, the build has no consent form and
      needs the IronSource treatment for UMP (fetch the 3.1.0 xcframework in
      the CI pre-download step + `-F` flags in Package.swift). No ATT prompt,
      so the App Store privacy label must not claim tracking.
- [ ] App Store Connect (needs the user's login): age rating for 18+, not in
      the Kids category, App Privacy label updated for the ad SDKs (identifiers,
      usage data, diagnostics, coarse location; not used to track).
