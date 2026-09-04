// swift-tools-version:5.9
import PackageDescription

// AdMob iOS dependency — one Swift Package, nothing else.
//
// This is deliberately far simpler than the LevelPlay plugin it replaces.
// That one needed `build.rs` to pre-download two xcframework zips, unwrap
// their nested directory layout, and force `-F` / `-framework` flags onto both
// the Swift compile and the final Rust link step, all to work around SPM's
// binary-target bugs (swiftlang/swift-package-manager#5723). Google publishes
// GoogleMobileAds as a proper SPM package, so none of that machinery is
// needed here — no binary targets, no unsafeFlags, no manual link line, and
// no Swift-5.x compatibility-library staging in CI.
//
// Version is pinned exactly. GMA 13.x is the v12+ API generation: the GAD
// prefix is dropped from most types (`GADMobileAds` -> `MobileAds`,
// `GADRequest` -> `Request`, `GADExtras` -> `Extras`,
// `GADRewardedInterstitialAd` -> `RewardedInterstitialAd`). If you bump this,
// re-check `AdMobPlugin.swift` against the migration guide at
// https://developers.google.com/admob/ios/migration.
let package = Package(
    name: "tauri-plugin-admob",
    platforms: [
        .iOS(.v14),
    ],
    products: [
        .library(
            name: "tauri-plugin-admob",
            type: .static,
            targets: ["tauri-plugin-admob"]),
    ],
    dependencies: [
        .package(name: "Tauri", path: "../.tauri/tauri-api"),
        .package(
            url: "https://github.com/googleads/swift-package-manager-google-mobile-ads",
            exact: "13.2.0"
        ),
    ],
    targets: [
        .target(
            name: "tauri-plugin-admob",
            dependencies: [
                .byName(name: "Tauri"),
                .product(name: "GoogleMobileAds", package: "swift-package-manager-google-mobile-ads"),
            ],
            path: "Sources/tauri-plugin-admob"),
    ]
)
