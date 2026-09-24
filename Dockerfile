# ==============================================================================
# PranaVahini — Production Multi-Stage Container for Google Cloud Run
# Architecture:
#   Stage 1: Build React 19 Frontend with Vite (Node 20 slim)
#   Stage 2: Serve unified FastAPI backend + compiled frontend (Python 3.11 slim)
# ==============================================================================

# ------------------------------------------------------------------------------
# Stage 1: Frontend Build
# ------------------------------------------------------------------------------
FROM node:20-slim AS frontend-builder

WORKDIR /app/frontend

# Install dependencies
COPY frontend/package.json frontend/package-lock.json* ./
RUN npm ci --silent || npm install --silent

# Copy frontend source and build configuration
COPY frontend/ ./

# Build production bundle to /app/frontend/dist
RUN npm run build

# ------------------------------------------------------------------------------
# Stage 2: Production Python Runtime
# ------------------------------------------------------------------------------
FROM python:3.11-slim

WORKDIR /app

# Prevent Python from writing .pyc files and enable unbuffered streaming logs
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV ENVIRONMENT=production
ENV HOST=0.0.0.0

# Install production dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# Copy backend application code
COPY backend/ ./backend/

# Copy built frontend assets from Stage 1 into frontend/dist
COPY --from=frontend-builder /app/frontend/dist ./frontend/dist

# Copy SQLite database seed and documentation assets
COPY healthcare.db .
COPY executive_report.html .
COPY pranavahini_ui_design_audit.pdf .

# Create non-root system user for container security hardening
RUN adduser --disabled-password --gecos "" appuser && \
    chown -R appuser:appuser /app
USER appuser

# Expose default Google Cloud Run port
EXPOSE 8080

# Execute FastAPI via Uvicorn with dynamic Cloud Run $PORT binding
CMD exec uvicorn backend.main:app --host 0.0.0.0 --port ${PORT:-8080}
