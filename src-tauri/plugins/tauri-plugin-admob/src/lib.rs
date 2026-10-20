// Tauri plugin for Google AdMob (Google Mobile Ads SDK) on Android & iOS.
//
// ## Why this plugin exists
//
// It replaces `tauri-plugin-levelplay` (Unity LevelPlay / ironSource
// mediation) on the native build. Google Play rejected com.tree.smashers in
// 2026-09 under "Families Ad Format Requirements" — unclosable ads, and ads
// not clearly distinguishable from app content. Through a mediation waterfall
// the publisher cannot control the winning creative at all, so the native
// build talks to Google's own SDK directly and shows opt-in rewarded ads only.
//
// Going direct did NOT make the ads closeable after 5 seconds: the rewarded
// interstitial unit was measured serving two-ad pods with no close button for
// 17–36 s, and version code 1000024 was rejected for it. The template is
// Google's server-side choice. ADS_STATE.md has the measurements and the check
// (`tools/ad-closeability/measure.mjs`) that must pass before ads ship.
//
// ## Families / COPPA posture (all enforced on the native side)
//   - `RequestConfiguration` sets TFCD=TRUE (TFUA stays unspecified — the two
//     must not both be true) and maxAdContentRating="G" BEFORE
//     `MobileAds.initialize`, so no request can leave the device untagged.
//   - The plugin manifest strips AD_ID and every Privacy Sandbox ad permission.
//   - There is no interstitial, banner, app-open or native-ad code path in the
//     shipped binary.
//   - Android shows ads non-immersive, so the system's first-run "Viewing
//     full screen" panel never covers an ad's close button.
//
// ## Design
//   - Desktop builds get an inert stub (no GMA SDK for desktop); the JS-side
//     `isRewardedReady` stays false and every ad affordance stays hidden.
//   - Mobile builds register a native implementation:
//         Android -> com.plugin.admob.AdMobPlugin (Kotlin)
//         iOS     -> init_plugin_admob (Swift)
//
// Commands (JS invoke names are snake_case, native methods camelCase to match
// Kotlin `@Command` + Swift `@objc` conventions):
//   - plugin:admob|init          -> init the SDK and preload one rewarded ad
//   - plugin:admob|show_rewarded -> show the loaded rewarded ad

use tauri::{
    plugin::{Builder, TauriPlugin},
    Manager, Runtime,
};

pub use models::*;

mod commands;
mod error;
mod models;

#[cfg(desktop)]
mod desktop;
#[cfg(mobile)]
mod mobile;

pub use error::{Error, Result};

#[cfg(desktop)]
use desktop::Admob;
#[cfg(mobile)]
use mobile::Admob;

pub trait AdmobExt<R: Runtime> {
    fn admob(&self) -> &Admob<R>;
}

impl<R: Runtime, T: Manager<R>> crate::AdmobExt<R> for T {
    fn admob(&self) -> &Admob<R> {
        self.state::<Admob<R>>().inner()
    }
}

pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::new("admob")
        .invoke_handler(tauri::generate_handler![
            commands::init,
            commands::show_rewarded,
        ])
        .setup(|app, api| {
            #[cfg(mobile)]
            let admob = mobile::init(app, api)?;
            #[cfg(desktop)]
            let admob = desktop::init(app, api)?;
            app.manage(admob);
            Ok(())
        })
        .build()
}
