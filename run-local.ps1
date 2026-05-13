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

$jar = Get-ChildItem -Path build/libs -Filter "*.jar" -ErrorAction SilentlyContinue |
       Where-Object { $_.Name -notlike "*-plain.jar" } |
       Select-Object -First 1

if (-not $SkipBuild -or -not $jar) {
    Write-Host "→ Building bootJar..." -ForegroundColor Cyan
    .\gradlew.bat --quiet bootJar -x test
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    $jar = Get-ChildItem -Path build/libs -Filter "*.jar" |
           Where-Object { $_.Name -notlike "*-plain.jar" } |
           Select-Object -First 1
}

Write-Host "→ Starting Spring Boot on http://localhost:8080 ..." -ForegroundColor Cyan
Write-Host "  (running $($jar.Name) directly so env vars are inherited)" -ForegroundColor DarkGray

# We had repeated issues where PowerShell mangled the MongoDB URI (it
# contains '&' which PS treats specially) when passing it as args to java.
# Solution: write a Java @argfile that java reads directly with no shell
# parsing in between. Bullet-proof.
$secretsFile = Join-Path $root "secrets\application-secrets.properties"
$argfile     = Join-Path $root "build\java-args.txt"

$lines = @()
if (Test-Path $secretsFile) {
    # Quote the value so spaces/specials are literal to Spring.
    $lines += "--spring.config.import=`"optional:file:./secrets/application-secrets.properties`""
    # Also pass the Mongo URI directly as a program arg (highest precedence).
    # We read it back from the secrets file to avoid duplicating it here.
    $mongoLine = (Get-Content $secretsFile | Where-Object { $_ -match "^spring\.data\.mongodb\.uri=" } | Select-Object -First 1)
    if ($mongoLine) {
        $uri = $mongoLine -replace "^spring\.data\.mongodb\.uri=", ""
        $lines += "--spring.data.mongodb.uri=$uri"
        $mongoHost = ($uri -split "@")[1] -split "/" | Select-Object -First 1
        Write-Host "  Mongo target: $mongoHost (passed as @argfile arg)" -ForegroundColor Green
    }
    Write-Host "  loading overrides from secrets/application-secrets.properties via @argfile" -ForegroundColor DarkGray
} else {
    Write-Host "  WARNING: secrets/application-secrets.properties not found - using application.yml defaults" -ForegroundColor Yellow
}

if ($lines.Count -gt 0) {
    $lines | Set-Content -Path $argfile -Encoding ascii
    java -jar $jar.FullName "@$argfile"
} else {
    java -jar $jar.FullName
}

