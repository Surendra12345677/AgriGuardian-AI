#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────
# AgriGuardian AI — one-shot Cloud Run deploy (Cloud Shell friendly)
#
# Deploys BOTH services so judges land on a real dashboard:
#   1) agriguardian-ai      — Spring Boot backend (Dockerfile at repo root)
#   2) agriguardian-web     — Next.js dashboard   (web/Dockerfile)
#      with BACKEND_URL pointing at the backend Cloud Run URL.
#
# Reads sensitive values from .env at the repo root:
#   MONGODB_URI, GEMINI_API_KEY, ARIZE_API_KEY, ARIZE_SPACE_ID
# Optional: GEMINI_MODEL, ARIZE_OTLP_ENDPOINT
#
# Usage (Cloud Shell or any Linux/macOS shell with gcloud):
#   chmod +x agent-builder/deploy.sh
#   ./agent-builder/deploy.sh                       # uses default project
#   GCP_PROJECT_ID=my-other-project ./agent-builder/deploy.sh
#
# Re-runs are safe — secrets are versioned, services are updated in place.
# ─────────────────────────────────────────────────────────────────────
set -euo pipefail

PROJECT_ID="${GCP_PROJECT_ID:-agriguardian-ai-496206}"
REGION="${GCP_REGION:-us-central1}"
BACKEND_SERVICE="agriguardian-ai"
WEB_SERVICE="agriguardian-web"

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="$ROOT_DIR/.env"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "ERROR: .env not found at $ENV_FILE — copy .env.example and fill it in." >&2
  exit 1
fi

# Parse .env safely line-by-line. We can't `source` it because values like
# the Mongo URI contain `&` and `?` which bash would interpret as job
# control / globs and silently truncate the variable (the bug that made
# the first run print "MONGODB_URI is empty").
while IFS= read -r raw || [[ -n "$raw" ]]; do
  # strip CR (Windows line endings) + leading/trailing spaces
  line="${raw%$'\r'}"
  line="${line#"${line%%[![:space:]]*}"}"
  [[ -z "$line" || "${line:0:1}" == "#" ]] && continue
  [[ "$line" != *"="* ]] && continue
  key="${line%%=*}"
  val="${line#*=}"
  # trim spaces around the key; keep the value verbatim (URLs need it)
  key="${key// /}"
  # strip surrounding quotes if any
  if [[ "$val" == \"*\" || "$val" == \'*\' ]]; then
    val="${val:1:${#val}-2}"
  fi
  # only accept POSIX-style env names so a stray line can't clobber PATH
  if [[ "$key" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]]; then
    printf -v "$key" '%s' "$val"
    export "$key"
  fi
done < "$ENV_FILE"

need() {
  local k="$1"
  if [[ -z "${!k:-}" ]]; then
    echo "ERROR: $k is empty in .env — fill it in before deploying." >&2
    exit 1
  fi
}
need MONGODB_URI
need GEMINI_API_KEY
need ARIZE_API_KEY
need ARIZE_SPACE_ID
GEMINI_MODEL="${GEMINI_MODEL:-gemini-2.5-flash}"
ARIZE_OTLP_ENDPOINT="${ARIZE_OTLP_ENDPOINT:-https://otlp.arize.com/v1}"

echo "==> Project=$PROJECT_ID  Region=$REGION"
gcloud config set project "$PROJECT_ID" >/dev/null

echo "==> Enabling required APIs (idempotent)"
gcloud services enable \
    run.googleapis.com \
    cloudbuild.googleapis.com \
    artifactregistry.googleapis.com \
    secretmanager.googleapis.com \
    aiplatform.googleapis.com \
    discoveryengine.googleapis.com >/dev/null

upsert_secret() {
  local name="$1" value="$2"
  if ! gcloud secrets describe "$name" --project "$PROJECT_ID" >/dev/null 2>&1; then
    echo "    creating secret $name"
    gcloud secrets create "$name" --replication-policy=automatic --project "$PROJECT_ID" >/dev/null
  else
    echo "    secret $name exists, adding new version"
  fi
  # printf '%s' avoids the trailing newline that breaks Mongo / API-key auth.
  printf '%s' "$value" | gcloud secrets versions add "$name" --data-file=- --project "$PROJECT_ID" >/dev/null
}

echo "==> Pushing secrets to Secret Manager"
upsert_secret "agriguardian-mongodb-uri" "$MONGODB_URI"
upsert_secret "agriguardian-gemini-key"  "$GEMINI_API_KEY"
upsert_secret "agriguardian-arize-key"   "$ARIZE_API_KEY"

PROJECT_NUMBER="$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')"
RUNTIME_SA="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"
echo "==> Granting secretAccessor to $RUNTIME_SA"
for s in agriguardian-mongodb-uri agriguardian-gemini-key agriguardian-arize-key; do
  gcloud secrets add-iam-policy-binding "$s" \
      --member="serviceAccount:$RUNTIME_SA" \
      --role="roles/secretmanager.secretAccessor" \
      --project "$PROJECT_ID" >/dev/null || true
done

# ── 1/2  Backend (Spring Boot) ──────────────────────────────────────
BACKEND_ENV="SPRING_PROFILES_ACTIVE=prod,GEMINI_MODEL=$GEMINI_MODEL,GEMINI_STUB_MODE=auto,ARIZE_ENABLED=true,ARIZE_SPACE_ID=$ARIZE_SPACE_ID,ARIZE_OTLP_ENDPOINT=$ARIZE_OTLP_ENDPOINT,AGRIGUARDIAN_ARIZE_PROJECT_NAME=agriguardian-ai,MCP_ARIZE_ENABLED=false,MCP_MONGODB_ENABLED=false"
BACKEND_SECRETS="MONGODB_URI=agriguardian-mongodb-uri:latest,SPRING_DATA_MONGODB_URI=agriguardian-mongodb-uri:latest,GEMINI_API_KEY=agriguardian-gemini-key:latest,ARIZE_API_KEY=agriguardian-arize-key:latest"

echo "==> [1/2] Building + deploying BACKEND ($BACKEND_SERVICE)"
( cd "$ROOT_DIR" && gcloud run deploy "$BACKEND_SERVICE" \
    --source . \
    --region "$REGION" \
    --project "$PROJECT_ID" \
    --allow-unauthenticated \
    --memory 1Gi \
    --cpu 1 \
    --port 8080 \
    --timeout 300 \
    --max-instances 3 \
    --set-env-vars "$BACKEND_ENV" \
    --set-secrets "$BACKEND_SECRETS" )

BACKEND_URL="$(gcloud run services describe "$BACKEND_SERVICE" --region "$REGION" --project "$PROJECT_ID" --format='value(status.url)')"
echo "    backend URL: $BACKEND_URL"

# ── 2/2  Frontend (Next.js dashboard) ───────────────────────────────
echo "==> [2/2] Building + deploying WEB ($WEB_SERVICE) with BACKEND_URL=$BACKEND_URL"
( cd "$ROOT_DIR/web" && gcloud run deploy "$WEB_SERVICE" \
    --source . \
    --region "$REGION" \
    --project "$PROJECT_ID" \
    --allow-unauthenticated \
    --memory 512Mi \
    --cpu 1 \
    --port 8080 \
    --timeout 60 \
    --max-instances 3 \
    --set-env-vars "BACKEND_URL=$BACKEND_URL,NEXT_TELEMETRY_DISABLED=1" )

WEB_URL="$(gcloud run services describe "$WEB_SERVICE" --region "$REGION" --project "$PROJECT_ID" --format='value(status.url)')"

echo
echo "✅ Deployed."
echo "    Dashboard (paste this in Devpost): $WEB_URL"
echo "    Backend Swagger UI               : $BACKEND_URL/swagger-ui.html"
echo "    Backend health                   : $BACKEND_URL/actuator/health"
echo
echo "Done."

