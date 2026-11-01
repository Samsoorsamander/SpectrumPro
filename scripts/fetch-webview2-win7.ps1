# Download and extract WebView2 Fixed Runtime 109 (x86) for Windows 7 32-bit.
# Run from repo root: npm run fetch:webview2-win7

$ErrorActionPreference = "Stop"

$Version = "109.0.1518.78"
$CabName = "Microsoft.WebView2.FixedVersionRuntime.$Version.x86.cab"
$FolderName = "Microsoft.WebView2.FixedVersionRuntime.$Version.x86"
$Url = "https://github.com/westinyang/WebView2RuntimeArchive/releases/download/$Version/$CabName"
# Expected size ~177.8 MB (186,482,688 bytes from GitHub release asset listing ~177.8 MB)
$MinCabBytes = 150MB

$RepoRoot = Split-Path -Parent $PSScriptRoot
$SrcTauri = Join-Path $RepoRoot "src-tauri"
$CabPath = Join-Path $SrcTauri $CabName
$ExtractDir = Join-Path $SrcTauri $FolderName
$TempCab = Join-Path $env:TEMP $CabName

if (-not (Test-Path $SrcTauri)) {
    throw "src-tauri not found at $SrcTauri"
}

New-Item -ItemType Directory -Force -Path $SrcTauri | Out-Null

if (Test-Path $ExtractDir) {
    Write-Host "Already extracted: $ExtractDir"
    exit 0
}

function Get-CabIfValid([string]$Path) {
    if (-not (Test-Path $Path)) { return $false }
    $len = (Get-Item $Path).Length
    if ($len -lt $MinCabBytes) {
        Write-Host "Incomplete cab ($len bytes), removing: $Path"
        Remove-Item -Force $Path
        return $false
    }
    return $true
}

if (-not (Get-CabIfValid $CabPath)) {
    if (-not (Get-CabIfValid $TempCab)) {
        Write-Host "Downloading $CabName (~178 MB) via BITS to $TempCab ..."
        if (Test-Path $TempCab) { Remove-Item -Force $TempCab }
        Start-BitsTransfer -Source $Url -Destination $TempCab -ErrorAction Stop
        if (-not (Get-CabIfValid $TempCab)) {
            throw "Download finished but cab is still too small"
        }
        Write-Host "Download complete."
    } else {
        Write-Host "Using existing temp cab: $TempCab"
    }
    Write-Host "Copying cab into src-tauri..."
    Copy-Item -Force $TempCab $CabPath
}

Write-Host "Extracting to $SrcTauri ..."
$ExpandExe = Join-Path $env:SystemRoot "System32\expand.exe"
if (-not (Test-Path $ExpandExe)) {
    throw "Windows expand.exe not found at $ExpandExe"
}

# Expand to a short temp path first (spaces in project path can break expand.exe)
$TempExtractRoot = Join-Path $env:TEMP "wv2-extract-$Version"
if (Test-Path $TempExtractRoot) {
    Remove-Item -Recurse -Force $TempExtractRoot
}
New-Item -ItemType Directory -Force -Path $TempExtractRoot | Out-Null

& $ExpandExe $CabPath -F:* $TempExtractRoot
if ($LASTEXITCODE -ne 0) {
    throw "expand.exe failed with exit code $LASTEXITCODE"
}

$Extracted = Join-Path $TempExtractRoot $FolderName
if (-not (Test-Path $Extracted)) {
    # Some expand layouts nest differently
    $found = Get-ChildItem -Directory $TempExtractRoot | Where-Object { $_.Name -like "Microsoft.WebView2.FixedVersionRuntime*" } | Select-Object -First 1
    if ($null -eq $found) {
        throw "Expected folder missing after extract under $TempExtractRoot"
    }
    $Extracted = $found.FullName
}

if (Test-Path $ExtractDir) {
    Remove-Item -Recurse -Force $ExtractDir
}
Move-Item -Force $Extracted $ExtractDir
Remove-Item -Recurse -Force $TempExtractRoot -ErrorAction SilentlyContinue

Write-Host "WebView2 Fixed Runtime ready at: $ExtractDir"
