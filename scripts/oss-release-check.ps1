[CmdletBinding()]
param(
  [switch]$SkipInstaller
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$ProjectRoot = Split-Path -Parent $PSScriptRoot
$ManifestPath = Join-Path $ProjectRoot "src-tauri\Cargo.toml"
$LockfilePath = Join-Path $ProjectRoot "src-tauri\Cargo.lock"
$LocalBuildRoot = if ($env:LOCALAPPDATA) { $env:LOCALAPPDATA } else { [System.IO.Path]::GetTempPath() }
$CargoBuildBase = Join-Path $LocalBuildRoot "AI-Ensemble-Build"
$ExistingCargoTarget = if (Test-Path $CargoBuildBase) {
  Get-ChildItem -LiteralPath $CargoBuildBase -Directory -Filter "v1.3.4-*" |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 1
} else {
  $null
}
$CargoTargetDir = if ($ExistingCargoTarget) {
  $ExistingCargoTarget.FullName
} else {
  Join-Path $CargoBuildBase "v1.3.4-shared"
}
$NsisPath = Join-Path $CargoTargetDir "release\bundle\nsis"
$ReleaseOutputPath = Join-Path $ProjectRoot "release-output"
$HandoffPath = Join-Path $ProjectRoot "AI-Ensemble-v1.3.4-OSS-VERIFIED-SOURCE.zip"

function Write-Step {
  param([Parameter(Mandatory = $true)][string]$Message)
  Write-Host ""
  Write-Host "==> $Message" -ForegroundColor Cyan
}

function Invoke-Checked {
  param(
    [Parameter(Mandatory = $true)][string]$Command,
    [string[]]$Arguments = @()
  )

  & $Command @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "$Command failed with exit code $LASTEXITCODE"
  }
}

Set-Location $ProjectRoot
$env:CARGO_TARGET_DIR = $CargoTargetDir
$env:CARGO_BUILD_JOBS = "1"

Write-Host "Rust build output: $CargoTargetDir"
Write-Host "Cargo parallel jobs: 1"

Write-Step "Checking required tools"
foreach ($CommandName in @("node", "npm", "cargo", "rustup")) {
  if (-not (Get-Command $CommandName -ErrorAction SilentlyContinue)) {
    throw "$CommandName was not found. Install Node.js 20+ and the stable Rust toolchain, then try again."
  }
}

Write-Step "Installing Rust formatting and lint components"
Invoke-Checked "rustup" @("component", "add", "rustfmt", "clippy")

Write-Step "Installing exact JavaScript dependencies"
Invoke-Checked "npm" @("ci")

Write-Step "Running frontend typecheck, tests, and production build"
Invoke-Checked "npm" @("run", "verify")

Write-Step "Auditing production npm dependencies"
Invoke-Checked "npm" @("audit", "--omit=dev", "--audit-level=high")

Write-Step "Reporting all npm advisories (critical findings fail this gate)"
Invoke-Checked "npm" @("audit", "--audit-level=critical")

if (-not (Test-Path $LockfilePath)) {
  Write-Step "Generating src-tauri/Cargo.lock"
  Invoke-Checked "cargo" @("generate-lockfile", "--manifest-path", $ManifestPath)
}

Write-Step "Formatting Rust source"
Invoke-Checked "cargo" @("fmt", "--manifest-path", $ManifestPath)

Write-Step "Verifying Rust formatting"
Invoke-Checked "cargo" @("fmt", "--manifest-path", $ManifestPath, "--", "--check")

Write-Step "Running Rust tests with the committed dependency set"
Invoke-Checked "cargo" @("test", "--manifest-path", $ManifestPath, "--locked")

Write-Step "Running Clippy with warnings treated as errors"
Invoke-Checked "cargo" @("clippy", "--manifest-path", $ManifestPath, "--locked", "--all-targets", "--", "-D", "warnings")

if (-not $SkipInstaller) {
  Write-Step "Building and inspecting the Windows NSIS release"
  Invoke-Checked "npm" @("run", "tauri:build")

  Write-Step "Copying the verified Windows installer"
  if (-not (Test-Path $NsisPath)) {
    throw "NSIS output was not found at $NsisPath"
  }
  New-Item -ItemType Directory -Path $ReleaseOutputPath -Force | Out-Null
  Get-ChildItem -LiteralPath $NsisPath -File | ForEach-Object {
    Copy-Item -LiteralPath $_.FullName -Destination $ReleaseOutputPath -Force
  }
}

Write-Step "Creating the verified source handoff archive"
$TempRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("ai-ensemble-handoff-" + [guid]::NewGuid().ToString("N"))
$PayloadPath = Join-Path $TempRoot "AI-Ensemble-v1.3.4-OSS-VERIFIED-SOURCE"
New-Item -ItemType Directory -Path $PayloadPath -Force | Out-Null
try {
  $ExcludedNames = @("node_modules", "dist", ".git", "release-output", "tsconfig.tsbuildinfo")
  $ExcludedExtensions = @(".zip", ".exe", ".msi", ".dmg", ".db", ".sqlite", ".sqlite3", ".log")
  Get-ChildItem -LiteralPath $ProjectRoot -Force | Where-Object {
    $Name = $_.Name
    $Extension = $_.Extension.ToLowerInvariant()
    -not ($ExcludedNames -contains $Name) -and
      -not ($Name -eq ".env" -or $Name.StartsWith(".env.")) -and
      -not ($ExcludedExtensions -contains $Extension)
  } | ForEach-Object {
    Copy-Item -LiteralPath $_.FullName -Destination $PayloadPath -Recurse -Force
  }

  $CopiedTarget = Join-Path $PayloadPath "src-tauri\target"
  if (Test-Path $CopiedTarget) {
    Remove-Item -LiteralPath $CopiedTarget -Recurse -Force
  }
  if (Test-Path $HandoffPath) {
    Remove-Item -LiteralPath $HandoffPath -Force
  }
  Compress-Archive -LiteralPath $PayloadPath -DestinationPath $HandoffPath -CompressionLevel Optimal
}
finally {
  if (Test-Path $TempRoot) {
    Remove-Item -LiteralPath $TempRoot -Recurse -Force
  }
}

Write-Host ""
Write-Host "OSS release check passed." -ForegroundColor Green
Write-Host "Cargo lockfile: $LockfilePath"
Write-Host "Verified source handoff: $HandoffPath"
if (-not $SkipInstaller) {
  Write-Host "Windows installer: $ReleaseOutputPath"
  Write-Host "Install the generated package once and confirm launch before publishing a release tag."
}
Write-Host "Send AI-Ensemble-v1.3.4-OSS-VERIFIED-SOURCE.zip back for the final publication audit."
