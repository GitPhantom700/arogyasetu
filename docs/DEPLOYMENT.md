# PranaVahini — Cloud Deployment Guide

This guide details the step-by-step procedure to deploy **PranaVahini** to **Google Cloud Run** for the **Build with AI: Code for Communities (Second Edition)** hackathon.

> **Live Production URL:** [https://pranavahini-615569835878.asia-south2.run.app](https://pranavahini-615569835878.asia-south2.run.app)  
> **Interactive Swagger API:** [https://pranavahini-615569835878.asia-south2.run.app/docs](https://pranavahini-615569835878.asia-south2.run.app/docs)  
> **Executive Report & Dossier:** [https://pranavahini-615569835878.asia-south2.run.app/report](https://pranavahini-615569835878.asia-south2.run.app/report)  

---

## 🏗️ Deployment Architecture

* **Compute:** Google Cloud Run (Fully managed, autoscaling container)
* **Image:** Multi-stage Docker container (React 19 Vite Frontend + Python 3.11 FastAPI Backend)
* **Port:** Dynamic port binding (`${PORT:-8080}`)
* **Database:** SQLite with WAL Mode pre-seeded with 15 Pune & Satara PHCs and 183 drug batches
* **AI Provider:** Google Gemini API (via `GEMINI_API_KEY`)

---

## 📋 Prerequisites

1. A **Google Cloud Platform (GCP)** account with billing enabled.
2. The **PranaVahini** source code pushed to your GitHub repository.
3. *(Optional)* `gcloud` CLI installed locally, or access to [Google Cloud Shell](https://shell.cloud.google.com/).

---

## 🚀 Method 1: 1-Click Continuous Deployment via Cloud Run Console (Recommended)

This is the fastest and most reliable deployment method for hackathon evaluation:

1. Open the [Google Cloud Run Console](https://console.cloud.google.com/run).
2. Click **Create Service**.
3. Select **Continuously deploy from a repository**.
4. Click **Set up with Cloud Build**:
   - Provider: **GitHub**
   - Repository: Select your PranaVahini repository (`pranavahini`).
   - Branch: `^main$`
   - Build Type: **Dockerfile** (Source location: `/Dockerfile`).
5. Configure Service Settings:
   - **Service Name:** `pranavahini`
   - **Region:** `asia-south1` (Mumbai) or `us-central1`.
   - **Authentication:** Check **Allow unauthenticated invocations** (so hackathon judges can access the live link).
   - **Port:** `8080`.
6. Expand **Container, Volumes, Networking, Security**:
   - Under **Environment Variables**, add:
     - `GEMINI_API_KEY`: *Your Google AI Studio Gemini API Key*
     - `ENVIRONMENT`: `production`
     - `CORS_ORIGINS`: `*`
7. Click **Create**.
8. Cloud Build will automatically build the container image and deploy it. In 2–3 minutes, you will receive your public HTTPS URL:
   ```
   https://pranavahini-615569835878.asia-south2.run.app
   ```

---

## 💻 Method 2: Command-Line Deployment via `gcloud` CLI

If deploying via Google Cloud Shell or your local terminal with `gcloud` installed:

```bash
# 1. Authenticate with Google Cloud
gcloud auth login
gcloud config set project YOUR_PROJECT_ID

# 2. Enable necessary APIs
gcloud services enable run.googleapis.com cloudbuild.googleapis.com

# 3. Build and deploy directly from source
gcloud run deploy pranavahini \
    --source . \
    --platform managed \
    --region asia-south1 \
    --allow-unauthenticated \
    --port 8080 \
    --set-env-vars "ENVIRONMENT=production,CORS_ORIGINS=*,GEMINI_API_KEY=YOUR_GEMINI_API_KEY"
```

---

## 🔄 Method 3: Instant Fallback Deployment (Render.com)

If your Google Cloud account is pending verification or billing activation, you can deploy to Render in 2 minutes:

1. Go to [Render Dashboard](https://dashboard.render.com/) and click **New + > Web Service**.
2. Connect your GitHub repository.
3. Select **Docker** as the runtime (Render will automatically detect the root `Dockerfile`).
4. Choose the Free instance type and add your `GEMINI_API_KEY` under Environment Variables.
5. Click **Deploy Web Service** to obtain a public URL (e.g. `https://pranavahini.onrender.com`).

---

## ✅ Post-Deployment Verification Checklist

Once deployed, verify the following endpoints on your public URL:

1. **Frontend Command Center:** Visit `https://<YOUR-APP-URL>/` — confirm Leaflet GIS map loads with 15 green/yellow/red facility markers.
2. **REST API Health Check:** Visit `https://<YOUR-APP-URL>/api/health` — must return:
   ```json
   {"status": "healthy", "service": "PranaVahini Emergency Logistics API"}
   ```
3. **Interactive Swagger Docs:** Visit `https://<YOUR-APP-URL>/docs` — confirm all 13 modular routers are accessible.
4. **Executive Research Report:** Visit `https://<YOUR-APP-URL>/report` — confirm the full due diligence report renders cleanly.
5. **Live Crisis Simulation:** In the UI, navigate to the **Crisis Simulator**, click **Activate Simulated Outbreak**, and verify Server-Sent Events (SSE) stream alerts live.
