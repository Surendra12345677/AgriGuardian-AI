# ─────────────────────────────────────────────────────────────────────
# AgriGuardian AI — local dev runner (Windows / PowerShell)
#
# Loads .env into the current process, then runs Spring Boot via Gradle.
# The .env file is gitignored and contains the MongoDB Atlas URI plus
# Gemini / Arize keys. Edit .env (NOT this script) to change secrets.
#
# Usage:
#   .\run-local.ps1            # start backend on http://localhost:8080
#   .\run-local.ps1 -SkipBuild # skip ./gradlew build, just (re)run
# ─────────────────────────────────────────────────────────────────────
param(
    [switch]$SkipBuild
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root

if (-not (Test-Path .env)) {
    Write-Host "❌ .env not found. Copy .env from a teammate or template." -ForegroundColor Red
    exit 1
}

Write-Host "→ Loading .env into process env..." -ForegroundColor Cyan
Get-Content .env | ForEach-Object {
    $line = $_.Trim()
    if ($line -and -not $line.StartsWith("#") -and $line.Contains("=")) {
        $idx  = $line.IndexOf("=")
        $name = $line.Substring(0, $idx).Trim()
        $val  = $line.Substring($idx + 1).Trim()
        # strip surrounding quotes if present
        if ($val.StartsWith('"') -and $val.EndsWith('"')) {
            $val = $val.Substring(1, $val.Length - 2)
        }
        [Environment]::SetEnvironmentVariable($name, $val, "Process")
    }
}

Write-Host "→ MONGODB_URI host: $((${env:MONGODB_URI} -split '@')[1] -split '/' | Select-Object -First 1)" -ForegroundColor Green
Write-Host "→ GEMINI_STUB_MODE = $env:GEMINI_STUB_MODE (key set: $([bool]$env:GEMINI_API_KEY))" -ForegroundColor Green

if (-not $SkipBuild) {
    Write-Host "→ Building..." -ForegroundColor Cyan
    .\gradlew.bat --quiet build -x test
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}

Write-Host "→ Starting Spring Boot on http://localhost:8080 ..." -ForegroundColor Cyan
.\gradlew.bat --quiet bootRun

