"""
FastAPI Main Application Entrypoint.
Healthcare Supply Chain & Emergency Logistics Platform.
Build with AI: Code for Communities (Second Edition).
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, RedirectResponse
import os
import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent
STATIC_DIR = BACKEND_DIR / "static"
sys.path.insert(0, str(BACKEND_DIR))

from routes.health import router as health_router
from routes.facilities import router as facilities_router
from routes.medicines import router as medicines_router
from routes.inventory import router as inventory_router
from routes.stats import router as stats_router
from routes.transfers import router as transfers_router
from routes.alerts import router as alerts_router
from routes.register_scan import router as register_scan_router
from routes.rebalance import router as rebalance_router
from routes.safety import router as safety_router
from routes.crisis import router as crisis_router
from routes.abdm import router as abdm_router
from routes.brics import router as brics_router

app = FastAPI(
    title="Healthcare Supply Chain & Emergency Logistics Platform",
    description="Federated public health emergency logistics platform providing real-time visibility into medicine stocks, bed availability, and inter-PHC resource redistribution.",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc"
)

# Dynamic CORS configuration (supports local dev and cloud deployments like Google Cloud Run)
raw_cors = os.environ.get("CORS_ORIGINS", "")
if raw_cors.strip() == "*":
    ALLOWED_ORIGINS = ["*"]
    ALLOW_CREDENTIALS = False
elif raw_cors.strip():
    ALLOWED_ORIGINS = [origin.strip() for origin in raw_cors.split(",") if origin.strip()]
    ALLOW_CREDENTIALS = True
else:
    ALLOWED_ORIGINS = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:8000",
        "http://127.0.0.1:8000",
    ]
    ALLOW_CREDENTIALS = True

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=ALLOW_CREDENTIALS,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register sub-routers
app.include_router(health_router)
app.include_router(facilities_router)
app.include_router(medicines_router)
app.include_router(inventory_router)
app.include_router(stats_router)
app.include_router(transfers_router)
app.include_router(alerts_router)
app.include_router(register_scan_router)
app.include_router(rebalance_router)
app.include_router(safety_router)
app.include_router(crisis_router)
app.include_router(abdm_router)
app.include_router(brics_router)

# Mount frontend build artifacts and static assets to unify frontend & backend on port 8000
PROJECT_ROOT = BACKEND_DIR.parent
FRONTEND_DIST = PROJECT_ROOT / "frontend" / "dist"
FRONTEND_ASSETS = FRONTEND_DIST / "assets"

if FRONTEND_ASSETS.exists():
    app.mount("/assets", StaticFiles(directory=str(FRONTEND_ASSETS)), name="assets")

if STATIC_DIR.exists():
    app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")


@app.get("/", include_in_schema=False)
def root():
    dist_index = FRONTEND_DIST / "index.html"
    if dist_index.exists():
        return FileResponse(dist_index)
    index_file = STATIC_DIR / "index.html"
    if index_file.exists():
        return FileResponse(index_file)
    return RedirectResponse(url="/docs")


@app.get("/report", include_in_schema=False)
@app.get("/executive-report", include_in_schema=False)
def executive_report():
    report_file = PROJECT_ROOT / "executive_report.html"
    if report_file.exists():
        return FileResponse(report_file, media_type="text/html")
    return {"error": "Executive report not found on server"}


if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8000))
    host = os.environ.get("HOST", "0.0.0.0")
    reload = os.environ.get("ENVIRONMENT", "production").lower() == "development"
    uvicorn.run("main:app", host=host, port=port, reload=reload)

