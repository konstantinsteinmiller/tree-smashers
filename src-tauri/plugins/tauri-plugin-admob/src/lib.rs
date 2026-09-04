// Tauri plugin for Google AdMob (Google Mobile Ads SDK) on Android & iOS.
//
// ## Why this plugin exists
//
// It replaces `tauri-plugin-levelplay` (Unity LevelPlay / ironSource
// mediation) on the native build. Google Play rejected com.chaos.arena in
// 2026-09 under "Families Ad Format Requirements" — unclosable ads, and ads
// not clearly distinguishable from app content. Through a mediation waterfall
// the publisher cannot guarantee the winning creative is closeable after 5
// seconds, so the native build now talks to Google's own SDK directly and uses
// the one format Google documents as skippable-only: **rewarded interstitial**
// ad units.
//
// ## Families / COPPA posture (all enforced on the native side)
//   - `RequestConfiguration` sets TFCD=TRUE, TFUA=TRUE and
//     maxAdContentRating="G" BEFORE `MobileAds.initialize`, so no request can
//     leave the device untagged.
//   - Every request carries the `is_designed_for_families=true` extra.
//   - The plugin manifest strips AD_ID and every Privacy Sandbox ad permission.
//   - There is no interstitial, banner, app-open or native-ad code path in the
//     shipped binary.
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
//   - plugin:admob|show_rewarded -> show the loaded rewarded-interstitial ad

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
