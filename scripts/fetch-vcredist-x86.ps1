# Download Visual C++ 2015-2022 Redistributable (x86) for Windows 7 UCRT.
# Required for api-ms-win-crt-*.dll on Win7.

$ErrorActionPreference = "Stop"

$RepoRoot = Split-Path -Parent $PSScriptRoot
$OutDir = Join-Path $RepoRoot "src-tauri\win7-redist"
$OutFile = Join-Path $OutDir "vc_redist.x86.exe"
$Url = "https://aka.ms/vs/17/release/vc_redist.x86.exe"

New-Item -ItemType Directory -Force -Path $OutDir | Out-Null

if ((Test-Path $OutFile) -and ((Get-Item $OutFile).Length -gt 1MB)) {
    Write-Host "Already present: $OutFile ($((Get-Item $OutFile).Length) bytes)"
    exit 0
}

Write-Host "Downloading VC++ Redistributable x86..."
$Temp = Join-Path $env:TEMP "vc_redist.x86.exe"
try {
    Start-BitsTransfer -Source $Url -Destination $Temp -ErrorAction Stop
} catch {
    Write-Host "BITS failed, using Invoke-WebRequest..."
    Invoke-WebRequest -Uri $Url -OutFile $Temp -UseBasicParsing
}

Copy-Item -Force $Temp $OutFile
Write-Host "Saved $OutFile ($((Get-Item $OutFile).Length) bytes)"
