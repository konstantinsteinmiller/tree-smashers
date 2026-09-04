# Google Mobile Ads (AdMob) keep rules.
#
# play-services-ads ships its own consumer ProGuard rules, so this file only
# has to cover what R8 cannot see: the SDK reaches several classes reflectively
# through the WebView bridge and the ad-loading entry points.
-keep class com.google.android.gms.ads.** { *; }
-keep class com.google.android.gms.internal.ads.** { *; }
-dontwarn com.google.android.gms.ads.**

# Our own plugin class is instantiated by name from the Tauri plugin manager.
-keep class com.plugin.admob.** { *; }

# Deliberately NOT kept: com.ironsource.**, com.unity3d.**. Those SDKs are no
# longer compiled into the app (see this plugin's build.gradle.kts and
# ADS_STATE.md at the repo root). If a keep rule for them ever reappears here,
# something re-added a mediation dependency.
