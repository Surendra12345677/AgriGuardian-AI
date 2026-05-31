# ☁️ AgriGuardian AI — Cloud Shell Redeploy Guide

Use this guide when you want to redeploy the live **Cloud Run** backend and web app from **Google Cloud Shell**.

This repo already includes a Cloud-Shell-friendly script at `agent-builder/deploy.sh` that:
- enables required Google Cloud APIs
- pushes secrets into Secret Manager
- grants the runtime service account access to those secrets
- deploys the backend service `agriguardian-ai`
- deploys the frontend service `agriguardian-web`

---

## 1. Prerequisites

You need:
- access to the target Google Cloud project
- billing enabled on that project
- permission to deploy Cloud Run services and manage Secret Manager
- these values ready:
  - `MONGODB_URI`
  - `GEMINI_API_KEY`
  - `ARIZE_API_KEY`
  - `ARIZE_SPACE_ID`

Optional values:
- `GCP_PROJECT_ID` if you want a project other than the default in the script
- `GCP_REGION` if you want a region other than `us-central1`
- `GEMINI_MODEL`
- `GEMINI_FALLBACK_MODELS`
- `ARIZE_OTLP_ENDPOINT`

---

## 2. Open Cloud Shell

In the Google Cloud Console:
1. Open your target project.
2. Click the **Cloud Shell** terminal button.
3. Wait for the shell to initialize.

---

## 3. Clone the repo

```bash
git clone https://github.com/Surendra12345677/AgriGuardian-AI.git
cd AgriGuardian-AI
```

If the repo is already cloned in Cloud Shell:

```bash
cd AgriGuardian-AI
git pull --ff-only
```

---

## 4. Create the `.env` file

Copy the template:

```bash
cp .env.example .env
```

Edit it:

```bash
nano .env
```

At minimum, fill in:

```dotenv
MONGODB_URI=your-mongodb-uri
GEMINI_API_KEY=your-gemini-api-key
ARIZE_API_KEY=your-arize-api-key
ARIZE_SPACE_ID=your-arize-space-id
```

Recommended hosted values:

```dotenv
GEMINI_MODEL=gemini-3-pro-preview
GEMINI_FALLBACK_MODELS=gemini-3-flash-preview
ARIZE_OTLP_ENDPOINT=https://otlp.arize.com/v1
```

Save and exit:
- `Ctrl+O`, Enter
- `Ctrl+X`

---

## 5. Set the target project

If you want to deploy to the repo's default project, you can skip this.

To deploy to a specific project:

```bash
export GCP_PROJECT_ID="your-gcp-project-id"
gcloud config set project "$GCP_PROJECT_ID"
```

Optional region override:

```bash
export GCP_REGION="us-central1"
```

---

## 6. Run the redeploy script

```bash
chmod +x agent-builder/deploy.sh
./agent-builder/deploy.sh
```

What the script does:
1. reads `.env`
2. enables APIs
3. versions secrets in Secret Manager
4. grants the Cloud Run runtime service account secret access
5. deploys the backend
6. reads the backend URL
7. deploys the web app with `BACKEND_URL` pointed at that backend

---

## 7. Verify the deployment

When the script finishes, it prints the live URLs.

You can also verify manually:

```bash
gcloud run services describe agriguardian-ai --region "${GCP_REGION:-us-central1}" --format='value(status.url)'
gcloud run services describe agriguardian-web --region "${GCP_REGION:-us-central1}" --format='value(status.url)'
```

Then open:
- web app: the `agriguardian-web` URL
- backend health: `<backend-url>/actuator/health`
- backend API base: `<backend-url>/api/v1`

Quick health check:

```bash
BACKEND_URL="$(gcloud run services describe agriguardian-ai --region "${GCP_REGION:-us-central1}" --format='value(status.url)')"
curl "$BACKEND_URL/actuator/health"
```

---

## 8. If you changed the hosted URL

Update these files if the deployed URL changes:
- `README.md`
- `SUBMISSION.md`
- `DEVPOST_FORM.md`

If you recorded a new demo video, also replace the placeholder video URL in those docs.

---

## 9. Common fixes

### `.env not found`
Create it first:

```bash
cp .env.example .env
```

### Permission errors from `gcloud`
Make sure you are logged into the correct Google account and project:

```bash
gcloud auth list
gcloud config list project
```

### Secret or IAM step fails
You likely need more permissions in the target GCP project. Ask for:
- Cloud Run Admin
- Secret Manager Admin
- Service Account User
- Project IAM Admin or equivalent permissions for the one-time bindings

### Deploy succeeds but the app behaves incorrectly
Check logs:

```bash
gcloud run services logs read agriguardian-ai --region "${GCP_REGION:-us-central1}" --limit 100
gcloud run services logs read agriguardian-web --region "${GCP_REGION:-us-central1}" --limit 100
```

---

## 10. Fast redeploy command

Once `.env` already exists:

```bash
cd AgriGuardian-AI
git pull --ff-only
./agent-builder/deploy.sh
```

