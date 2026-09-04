plugins {
    id("com.android.library")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "com.plugin.admob"
    compileSdk = 36

    defaultConfig {
        minSdk = 24
        consumerProguardFiles("proguard-rules.pro")
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_1_8
        targetCompatibility = JavaVersion.VERSION_1_8
    }

    kotlinOptions {
        jvmTarget = "1.8"
    }

    buildFeatures {
        buildConfig = true
    }
}

dependencies {
    // Tauri Android runtime — supplies app.tauri.plugin.{Plugin, Invoke,
    // JSObject} and the app.tauri.annotation.{TauriPlugin, Command,
    // InvokeArg} annotations the plugin's @TauriPlugin class is built
    // against. The subproject is registered automatically by the Tauri CLI
    // in tauri.settings.gradle.
    implementation(project(":tauri-android"))

    // ── Google Mobile Ads (AdMob) — the ONLY ads SDK in this app ──────────
    //
    // Direct integration, no mediation. Google AdMob is on the Google Play
    // Families Self-Certified Ads SDK list, and 20.6.0+ is the floor at which
    // the SDK stops transmitting the advertising ID on child-directed
    // requests (see the AdMob "Comply with Google Play's Families Policy"
    // guide). We are far above that floor.
    //
    // The only format this app loads is a rewarded INTERSTITIAL ad unit:
    // Google serves skippable creatives exclusively into those units, which
    // is what satisfies the Families "closeable after 5 seconds" rule that
    // got version codes 1000012 / 1000020 rejected in 2026-09.
    implementation("com.google.android.gms:play-services-ads:24.9.0")

    // ── DO NOT re-add mediation without re-reading ADS_STATE.md ──────────
    //
    // Removed on 2026-09-03 as part of the Families rejection fix. Both were
    // pulling a mediation waterfall whose winning creative we could not
    // guarantee was closeable after 5 seconds:
    //
    //   com.unity3d.ads-mediation:mediation-sdk   (LevelPlay / ironSource)
    //   com.unity3d.ads-mediation:admob-adapter
    //   com.unity3d.ads-mediation:unityads-adapter
    //   com.unity3d.ads:unity-ads
    //
    // The LevelPlay plugin source is still in the tree at
    // src-tauri/plugins/tauri-plugin-levelplay/ but is NOT a Cargo dependency
    // of src-tauri, so the Tauri CLI never adds it to tauri.settings.gradle
    // and none of those artifacts land in the APK/AAB. Re-enable only after
    // a Families-compliant build has been ACCEPTED by Play, and only with
    // per-network format controls verified network-side.
    //
    // Never add Mintegral, Pangle, Vungle/Liftoff or Chartboost here: they
    // are not consistently certified for the Families Policy.

    implementation("androidx.appcompat:appcompat:1.7.1")
}
