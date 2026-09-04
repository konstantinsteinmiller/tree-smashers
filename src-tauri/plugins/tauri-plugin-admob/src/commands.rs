use tauri::{command, AppHandle, Runtime};

use crate::models::*;
use crate::AdmobExt;
use crate::Result;

#[command]
pub(crate) async fn init<R: Runtime>(
    app: AppHandle<R>,
    payload: InitRequest,
) -> Result<InitResponse> {
    app.admob().init_sdk(payload)
}

#[command]
pub(crate) async fn show_rewarded<R: Runtime>(app: AppHandle<R>) -> Result<ShowAdResponse> {
    app.admob().show_rewarded()
}
