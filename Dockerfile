# Stuđiô AI — multi-stage: build React SPA (Node) + runtime Python (FastAPI).
# Không cần commit frontend-react/dist: dist được build ngay trong Docker.

# ---- Stage 1: build frontend React ----
FROM node:20-slim AS frontend-build
WORKDIR /build
COPY frontend-react/package.json frontend-react/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY frontend-react/ ./
RUN npm run build

# ---- Stage 2: runtime Python ----
FROM python:3.11-slim

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PORT=8000

RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copy and install python dependencies
COPY backend/requirements.txt /app/backend/requirements.txt
RUN pip install --no-cache-dir -r /app/backend/requirements.txt

# Biến môi trường production: tắt trả dev_code trong API response
ENV OTP_RETURN_DEV_CODE=false

# Copy source code, built React SPA (từ stage 1), and legacy assets
COPY backend/ /app/backend/
COPY frontend/ /app/frontend/
COPY --from=frontend-build /build/dist/ /app/frontend-react/dist/

# Expose server port
EXPOSE 8000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=20s --retries=3 \
  CMD curl -f http://localhost:8000/docs || exit 1

# Launch uvicorn server
WORKDIR /app/backend
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
