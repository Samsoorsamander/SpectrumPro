# Fetch crates with Rust 1.77.2, patching edition2024 manifests between attempts.
# Cargo 1.77 uses a different registry src hash than modern stable, so we must
# download+patch iteratively until fetch succeeds.

$ErrorActionPreference = "Continue"
$RepoRoot = Split-Path -Parent $PSScriptRoot
$SrcTauri = Join-Path $RepoRoot "src-tauri"
$PatchScript = Join-Path $PSScriptRoot "patch-edition2024-for-win7.ps1"

Set-Location $SrcTauri

& $PatchScript
$max = 40
for ($i = 1; $i -le $max; $i++) {
    Write-Host "=== cargo +1.77.2 fetch attempt $i/$max (host + i686) ==="
    & cargo +1.77.2 fetch --target x86_64-pc-windows-msvc
    $hostOk = ($LASTEXITCODE -eq 0)
    & cargo +1.77.2 fetch --target i686-pc-windows-msvc
    $i686Ok = ($LASTEXITCODE -eq 0)
    if ($hostOk -and $i686Ok) {
        Write-Host "Fetch succeeded for host and i686."
        & $PatchScript
        exit 0
    }
    Write-Host "Fetch failed; patching edition2024 and retrying..."
    & $PatchScript
}

Write-Host "Fetch did not succeed after $max attempts"
exit 1
