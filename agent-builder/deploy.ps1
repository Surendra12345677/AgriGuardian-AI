# Deploy AgriGuardian AI to Google Cloud
#
# Prerequisites:
#   - GCP project with billing enabled
#   - gcloud CLI installed and authenticated (`gcloud auth login`)
#   - Variables filled in below
#
# Usage (PowerShell):
#   ./agent-builder/deploy.ps1

# ── EDIT THESE ───────────────────────────────────────────────────────
$PROJECT_ID = "agriguardian-ai"          # your GCP project id
$REGION     = "us-central1"
$SERVICE    = "agriguardian-ai"
# ─────────────────────────────────────────────────────────────────────

Write-Host "==> Setting project to $PROJECT_ID"
gcloud config set project $PROJECT_ID

Write-Host "==> Enabling required APIs"
gcloud services enable `
    run.googleapis.com `
    artifactregistry.googleapis.com `
    aiplatform.googleapis.com `
    discoveryengine.googleapis.com `
    secretmanager.googleapis.com

Write-Host "==> Building + deploying Spring Boot app to Cloud Run"
gcloud run deploy $SERVICE `
    --source . `
    --region $REGION `
    --allow-unauthenticated `
    --memory 1Gi `
    --cpu 1 `
    --port 8080 `
    --set-env-vars "SPRING_PROFILES_ACTIVE=prod,MCP_MONGODB_ENABLED=true"

$CLOUD_RUN_URL = gcloud run services describe $SERVICE --region $REGION --format "value(status.url)"
Write-Host "==> Cloud Run service URL: $CLOUD_RUN_URL"

Write-Host "==> Creating Agent Builder agent (one-time)"
Write-Host "    Manually upload agent-builder/agriguardian-agent.yaml at:"
Write-Host "    https://console.cloud.google.com/gen-app-builder/engines"
Write-Host "    Substitute these values in the YAML before upload:"
Write-Host "      CLOUD_RUN_URL = $CLOUD_RUN_URL"
Write-Host "      GCP_PROJECT   = $PROJECT_ID"

Write-Host ""
Write-Host "Done. Public demo URL: $CLOUD_RUN_URL/swagger-ui.html"

