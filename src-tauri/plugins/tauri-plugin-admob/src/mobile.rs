use serde::de::DeserializeOwned;
use tauri::{
    plugin::{PluginApi, PluginHandle},
    AppHandle, Runtime,
};

use crate::models::*;

#[cfg(target_os = "android")]
const PLUGIN_IDENTIFIER: &str = "com.plugin.admob";

#[cfg(target_os = "ios")]
tauri::ios_plugin_binding!(init_plugin_admob);

pub fn init<R: Runtime, C: DeserializeOwned>(
    _app: &AppHandle<R>,
    api: PluginApi<R, C>,
) -> crate::Result<Admob<R>> {
    #[cfg(target_os = "android")]
    let handle = api.register_android_plugin(PLUGIN_IDENTIFIER, "AdMobPlugin")?;
    #[cfg(target_os = "ios")]
    let handle = api.register_ios_plugin(init_plugin_admob)?;
    Ok(Admob(handle))
}

/// Handle to the native AdMob plugin. `run_mobile_plugin` dispatches to
/// `AdMobPlugin.kt` (Android) or `AdMobPlugin.swift` (iOS) by method name.
/// Method names are camelCase to match the `@Command`-annotated Kotlin
/// functions and the `@objc` Swift selectors.
pub struct Admob<R: Runtime>(PluginHandle<R>);

impl<R: Runtime> Admob<R> {
    pub fn init_sdk(&self, payload: InitRequest) -> crate::Result<InitResponse> {
        // Native method name is `initialize` — `init` is a Swift keyword
        // (NSObject constructor) so the iOS side cannot expose `@objc init:`
        // without colliding with the inherited selector. Kotlin uses the same
        // name to keep the Rust dispatch table platform-agnostic.
        self.0
            .run_mobile_plugin("initialize", payload)
            .map_err(Into::into)
    }

    pub fn show_rewarded(&self) -> crate::Result<ShowAdResponse> {
        self.0
            .run_mobile_plugin("showRewarded", ())
            .map_err(Into::into)
    }
}
