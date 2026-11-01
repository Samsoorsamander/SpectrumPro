fn main() {
    // Place the matching WebView2Loader.dll beside the binary (x86 for i686, x64 otherwise).
    let manifest = std::path::Path::new(env!("CARGO_MANIFEST_DIR"));
    let triple = std::env::var("TARGET").unwrap_or_default();
    let dll_src = if triple.contains("i686") || triple.contains("i586") {
        let win7 = manifest.join("win7-redist").join("WebView2Loader.dll");
        if win7.is_file() {
            win7
        } else {
            manifest
                .join("patches")
                .join("webview2-com-sys")
                .join("x86")
                .join("WebView2Loader.dll")
        }
    } else {
        manifest
            .join("patches")
            .join("webview2-com-sys")
            .join("x64")
            .join("WebView2Loader.dll")
    };

    if dll_src.is_file() {
        if let Ok(profile) = std::env::var("PROFILE") {
            let target = std::env::var("CARGO_TARGET_DIR")
                .unwrap_or_else(|_| manifest.join("target").display().to_string());
            let mut dest_dir = std::path::PathBuf::from(&target);
            // Host builds write to target/<profile>; cross builds use target/<triple>/<profile>.
            if !triple.is_empty() && triple != std::env::var("HOST").unwrap_or_default() {
                dest_dir.push(&triple);
            }
            dest_dir.push(&profile);
            let _ = std::fs::create_dir_all(&dest_dir);
            let dest = dest_dir.join("WebView2Loader.dll");
            let _ = std::fs::copy(&dll_src, &dest);
        }
        println!("cargo:rerun-if-changed={}", dll_src.display());
    }

    tauri_build::build()
}
