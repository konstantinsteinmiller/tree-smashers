use serde::{Deserialize, Serialize};

// Init payload sent from JS -> Rust -> native.
//
// Every default here favours the strictest child-directed configuration, so a
// caller that forgets a field still produces a COPPA / Google Play Families
// Policy compliant session. Overriding any of these from JS is deliberate and
// must be re-reviewed against the Families Policy Requirements first.
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InitRequest {
    /// AdMob **rewarded interstitial** ad unit ID (`ca-app-pub-.../...`, SLASH
    /// separator — a tilde means the *app* ID was pasted by mistake).
    ///
    /// Rewarded interstitial is the only format this plugin can show. Google
    /// serves *skippable* creatives exclusively into these units, which is
    /// what satisfies Play's "closeable after 5 seconds" Families rule. An
    /// empty string disables ads for the session: `show_rewarded` then returns
    /// a clean `not-configured` response instead of failing.
    #[serde(default)]
    pub rewarded_ad_unit_id: String,
    /// AdMob "Tag For Child-Directed Treatment" (COPPA). Applied through
    /// `RequestConfiguration` BEFORE the SDK initialises so every request is
    /// tagged from the first load onwards.
    #[serde(default = "default_true")]
    pub tag_for_child_directed_treatment: bool,
    /// AdMob "Tag For Users under the Age of consent" — the GDPR-K (EU
    /// under-16) signal.
    ///
    /// Defaults to FALSE, and that is deliberate: Google's targeting guide
    /// states that TFCD and TFUA "shouldn't both simultaneously be set to
    /// true". Chaos Arena declares a child-directed audience, so TFCD is the
    /// tag that applies and the native side forces TFUA back to UNSPECIFIED
    /// whenever TFCD is true. Set this only on a build that does NOT declare
    /// child-directed treatment.
    #[serde(default)]
    pub tag_for_under_age_of_consent: bool,
    /// Maximum ad content rating. "G" is the general-audiences tier and the
    /// only value acceptable for a 4+ / Families title.
    #[serde(default = "default_rating_g")]
    pub max_ad_content_rating: String,
    /// Adds `is_designed_for_families=true` to every ad request's extras — the
    /// signal Google's Designed for Families program keys off.
    #[serde(default = "default_true")]
    pub designed_for_families: bool,
    /// Debug-only: registers the running device as an AdMob test device so
    /// real inventory is replaced by test creatives. Never enable in release.
    #[serde(default)]
    pub use_test_ads: bool,
}

fn default_true() -> bool {
    true
}
fn default_rating_g() -> String {
    "G".to_string()
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InitResponse {
    pub initialized: bool,
}

#[derive(Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ShowAdResponse {
    pub shown: bool,
    #[serde(default)]
    pub rewarded: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}
