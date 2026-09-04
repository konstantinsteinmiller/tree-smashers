use serde::de::DeserializeOwned;
use tauri::{plugin::PluginApi, AppHandle, Runtime};

use crate::models::*;

pub fn init<R: Runtime, C: DeserializeOwned>(
    app: &AppHandle<R>,
    _api: PluginApi<R, C>,
) -> crate::Result<Admob<R>> {
    Ok(Admob(app.clone()))
}

/// Desktop stub. The Google Mobile Ads SDK is mobile-only, so every call is
/// inert and responses carry `shown: false`. The JS provider gates all ad UI
/// on `isRewardedReady`, which never flips true on desktop.
pub struct Admob<R: Runtime>(AppHandle<R>);

impl<R: Runtime> Admob<R> {
    pub fn init_sdk(&self, _payload: InitRequest) -> crate::Result<InitResponse> {
        Ok(InitResponse { initialized: false })
    }

    pub fn show_rewarded(&self) -> crate::Result<ShowAdResponse> {
        Ok(ShowAdResponse::default())
    }
}
