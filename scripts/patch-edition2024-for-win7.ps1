# Patch downloaded crates so Cargo 1.77.2 can parse them (edition2024 -> 2021).
# Safe for this project's Win7 builds only; does not change your global Rust default.
# Run from repo root after deps are fetched, before/while building with rust-toolchain 1.77.2.

$ErrorActionPreference = "Stop"
$roots = @(
    (Join-Path $env:USERPROFILE ".cargo\registry\src")
)

$count = 0
foreach ($root in $roots) {
    if (-not (Test-Path $root)) { continue }
    Get-ChildItem -Path $root -Recurse -Filter Cargo.toml -ErrorAction SilentlyContinue | ForEach-Object {
        $text = Get-Content -Raw $_.FullName
        if ($text -match 'edition\s*=\s*"2024"') {
            $new = $text -replace 'edition\s*=\s*"2024"', 'edition = "2021"'
            Set-Content -Path $_.FullName -Value $new -NoNewline
            $count++
            Write-Host "Patched $($_.FullName)"
        }
    }
}
Write-Host "Patched $count Cargo.toml file(s)."
