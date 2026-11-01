# Copy WebView2Loader.dll next to built exes (Win7 i686 + host x64).

$ErrorActionPreference = "Stop"
$RepoRoot = Split-Path -Parent $PSScriptRoot
$X86Dll = Join-Path $RepoRoot "src-tauri\win7-redist\WebView2Loader.dll"
$X64Dll = Join-Path $RepoRoot "src-tauri\patches\webview2-com-sys\x64\WebView2Loader.dll"
if (-not (Test-Path $X86Dll)) {
    # Fallback to patch x86 folder
    $X86Dll = Join-Path $RepoRoot "src-tauri\patches\webview2-com-sys\x86\WebView2Loader.dll"
}
if (-not (Test-Path $X86Dll)) {
    throw "Missing x86 WebView2Loader.dll"
}

$map = @(
    @{ Dir = (Join-Path $RepoRoot "src-tauri\target\i686-pc-windows-msvc\release"); Dll = $X86Dll },
    @{ Dir = (Join-Path $RepoRoot "src-tauri\target\i686-pc-windows-msvc\debug"); Dll = $X86Dll },
    @{ Dir = (Join-Path $RepoRoot "src-tauri\target\release"); Dll = $(if (Test-Path $X64Dll) { $X64Dll } else { $X86Dll }) },
    @{ Dir = (Join-Path $RepoRoot "src-tauri\target\debug"); Dll = $(if (Test-Path $X64Dll) { $X64Dll } else { $X86Dll }) }
)

$copied = $false
foreach ($item in $map) {
    if (Test-Path $item.Dir) {
        Copy-Item -Force $item.Dll (Join-Path $item.Dir "WebView2Loader.dll")
        Write-Host "Copied WebView2Loader.dll -> $($item.Dir)"
        $copied = $true
    }
}

if (-not $copied) {
    throw "No output directory found to copy WebView2Loader.dll into"
}
