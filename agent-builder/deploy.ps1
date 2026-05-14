# ─────────────────────────────────────────────────────────────────────
# AgriGuardian AI — Cloud Run deploy (Windows / PowerShell)
#
# Mirror of agent-builder/deploy.sh for users who want to deploy from a
# Windows shell with the gcloud CLI installed locally instead of using
# Cloud Shell. Steps are identical:
#   1. Set the active GCP project + region.
#   2. Enable required APIs.
#   3. Push secrets from .env into Secret Manager (idempotent).
#   4. Grant the Cloud Run runtime SA secretAccessor.
#   5. Build + deploy backend (Spring Boot) — agriguardian-ai service.
#   6. Build + deploy frontend (Next.js) — agriguardian-web service,
#      pointed at the backend Cloud Run URL via BACKEND_URL.
#   7. Print the dashboard URL to paste into the Devpost form.
#
# Prereqs:
#   - GCP project with billing enabled
#   - gcloud CLI installed locally + `gcloud auth login` already run
#   - .env at repo root with MONGODB_URI / GEMINI_API_KEY / ARIZE_API_KEY
#     / ARIZE_SPACE_ID populated.
#
# Usage from repo root:
#   ./agent-builder/deploy.ps1
#   ./agent-builder/deploy.ps1 -ProjectId my-other-gcp-project
# ─────────────────────────────────────────────────────────────────────

param(
    [string]$ProjectId = $env:GCP_PROJECT_ID,
    [string]$Region    = "us-central1",
    [string]$Service   = "agriguardian-ai",
    [string]$WebService = "agriguardian-web"
)

if (-not $ProjectId -or $ProjectId.Trim() -eq "") {
    # Default = the actual hackathon project id. Override with -ProjectId.
    $ProjectId = "agriguardian-ai-496206"
}

# Locate repo root (two levels up if needed; this file lives in agent-builder/).
$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$envPath  = Join-Path $RepoRoot ".env"
if (-not (Test-Path $envPath)) {
    throw ".env not found at $envPath — copy .env.example, fill it in, then re-run."
}

# Parse .env line-by-line (NEVER `Invoke-Expression` it — values like the
# Mongo URI contain & and ? which would be evaluated as shell operators).
$envMap = @{}
foreach ($raw in Get-Content -LiteralPath $envPath) {
    $line = $raw.TrimEnd("`r").Trim()
    if (-not $line -or $line.StartsWith("#") -or -not $line.Contains("=")) { continue }
    $eq = $line.IndexOf("=")
    $k = $line.Substring(0, $eq).Trim()
    $v = $line.Substring($eq + 1)
    if ($v.Length -ge 2 -and (($v.StartsWith('"') -and $v.EndsWith('"')) -or
                              ($v.StartsWith("'") -and $v.EndsWith("'")))) {
        $v = $v.Substring(1, $v.Length - 2)
    }
    if ($k -match '^[A-Za-z_][A-Za-z0-9_]*$') { $envMap[$k] = $v }
}
function Need($k) {
    if (-not $envMap.ContainsKey($k) -or -not $envMap[$k]) {
        throw "Missing $k in .env — fill it in before deploying."
    }
    return $envMap[$k]
}

$MongoUri    = Need "MONGODB_URI"
$GeminiKey   = Need "GEMINI_API_KEY"
$GeminiModel = if ($envMap.ContainsKey("GEMINI_MODEL") -and $envMap["GEMINI_MODEL"]) { $envMap["GEMINI_MODEL"] } else { "gemini-2.5-flash" }
$ArizeKey    = Need "ARIZE_API_KEY"
$ArizeSpace  = Need "ARIZE_SPACE_ID"
$ArizeOtlp   = if ($envMap.ContainsKey("ARIZE_OTLP_ENDPOINT") -and $envMap["ARIZE_OTLP_ENDPOINT"]) { $envMap["ARIZE_OTLP_ENDPOINT"] } else { "https://otlp.arize.com/v1" }

Write-Host "==> Project=$ProjectId  Region=$Region"
gcloud config set project $ProjectId | Out-Null

Write-Host "==> Enabling required APIs (idempotent)"
gcloud services enable `
    run.googleapis.com `
    cloudbuild.googleapis.com `
    artifactregistry.googleapis.com `
    secretmanager.googleapis.com `
    aiplatform.googleapis.com `
    discoveryengine.googleapis.com | Out-Null

function Upsert-Secret([string]$name, [string]$value) {
    gcloud secrets describe $name --project $ProjectId 2>$null | Out-Null
    if ($LASTEXITCODE -ne 0) {
        Write-Host "    creating secret $name"
        gcloud secrets create $name --replication-policy="automatic" --project $ProjectId | Out-Null
    } else {
        Write-Host "    secret $name exists, adding new version"
    }
    $tmp = New-TemporaryFile
    try {
        # -NoNewline: trailing \n in a Mongo URI / API key silently breaks auth.
        Set-Content -LiteralPath $tmp -Value $value -NoNewline -Encoding utf8
        gcloud secrets versions add $name --data-file=$tmp --project $ProjectId | Out-Null
    } finally {
        Remove-Item $tmp -Force -ErrorAction SilentlyContinue
    }
}

Write-Host "==> Pushing secrets to Secret Manager"
Upsert-Secret "agriguardian-mongodb-uri" $MongoUri
Upsert-Secret "agriguardian-gemini-key"  $GeminiKey
Upsert-Secret "agriguardian-arize-key"   $ArizeKey

$projectNumber = gcloud projects describe $ProjectId --format="value(projectNumber)"
$runtimeSa     = "$projectNumber-compute@developer.gserviceaccount.com"
Write-Host "==> Granting secretAccessor to $runtimeSa"
foreach ($s in @("agriguardian-mongodb-uri","agriguardian-gemini-key","agriguardian-arize-key")) {
    gcloud secrets add-iam-policy-binding $s `
        --member="serviceAccount:$runtimeSa" `
        --role="roles/secretmanager.secretAccessor" `
        --project $ProjectId | Out-Null
}

# ── 1/2  Backend (Spring Boot) ──────────────────────────────────────
$backendEnv = @(
    "SPRING_PROFILES_ACTIVE=prod",
    "GEMINI_MODEL=$GeminiModel",
    "GEMINI_STUB_MODE=auto",
    "ARIZE_ENABLED=true",
    "ARIZE_SPACE_ID=$ArizeSpace",
    "ARIZE_OTLP_ENDPOINT=$ArizeOtlp",
    "AGRIGUARDIAN_ARIZE_PROJECT_NAME=agriguardian-ai",
    "MCP_ARIZE_ENABLED=false",
    "MCP_MONGODB_ENABLED=false"
) -join ","

$backendSecrets = @(
    "MONGODB_URI=agriguardian-mongodb-uri:latest",
    "SPRING_DATA_MONGODB_URI=agriguardian-mongodb-uri:latest",
    "GEMINI_API_KEY=agriguardian-gemini-key:latest",
    "ARIZE_API_KEY=agriguardian-arize-key:latest"
) -join ","

Write-Host "==> [1/2] Building + deploying BACKEND ($Service)"
Push-Location $RepoRoot
try {
    gcloud run deploy $Service `
        --source . `
        --region $Region `
        --project $ProjectId `
        --allow-unauthenticated `
        --memory 1Gi `
        --cpu 1 `
        --port 8080 `
        --timeout 300 `
        --max-instances 3 `
        --set-env-vars $backendEnv `
        --set-secrets $backendSecrets
    if ($LASTEXITCODE -ne 0) { throw "backend deploy failed" }
} finally { Pop-Location }

$BackendUrl = gcloud run services describe $Service --region $Region --project $ProjectId --format="value(status.url)"
Write-Host "    backend URL: $BackendUrl"

# ── 2/2  Frontend (Next.js dashboard) ───────────────────────────────
Write-Host "==> [2/2] Building + deploying WEB ($WebService) with BACKEND_URL=$BackendUrl"
Push-Location (Join-Path $RepoRoot "web")
try {
    gcloud run deploy $WebService `
        --source . `
        --region $Region `
        --project $ProjectId `
        --allow-unauthenticated `
        --memory 512Mi `
        --cpu 1 `
        --port 8080 `
        --timeout 60 `
        --max-instances 3 `
        --set-env-vars "BACKEND_URL=$BackendUrl,NEXT_TELEMETRY_DISABLED=1"
    if ($LASTEXITCODE -ne 0) { throw "web deploy failed" }
} finally { Pop-Location }

$WebUrl = gcloud run services describe $WebService --region $Region --project $ProjectId --format="value(status.url)"

Write-Host ""
Write-Host "Deployed."
Write-Host "    Dashboard (paste in Devpost): $WebUrl"
Write-Host "    Backend Swagger UI          : $BackendUrl/swagger-ui.html"
Write-Host "    Backend health              : $BackendUrl/actuator/health"
