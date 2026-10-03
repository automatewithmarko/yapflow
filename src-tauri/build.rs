fn main() {
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("macos") {
        cc::Build::new()
            .file("src/macos_permissions.m")
            .flag("-fobjc-arc")
            .flag("-fblocks")
            .compile("yapflow_permissions");
        println!("cargo:rustc-link-lib=framework=AVFoundation");
        println!("cargo:rustc-link-lib=framework=AVFAudio");
        println!("cargo:rustc-link-lib=framework=ScreenCaptureKit");
        println!("cargo:rustc-link-lib=framework=CoreMedia");
        println!("cargo:rustc-link-lib=framework=CoreAudio");
        println!("cargo:rustc-link-lib=framework=Vision");
        println!("cargo:rerun-if-changed=src/macos_permissions.m");
    }
    tauri_build::build()
}
