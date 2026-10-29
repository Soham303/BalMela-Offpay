#!/usr/bin/env bash
set -e

echo "=== FestToken Event Launcher ==="

# 1. Activate Virtual Environment
if [ -d "venv" ]; then
    source venv/bin/activate
fi

# 2. Build Frontend
echo "[1/3] Building React Frontend..."
cd frontend
npm run build
cd ..

# 3. Seed Database if fresh
echo "[2/3] Checking Database..."
python3 -m backend.seed

# 4. Start Gunicorn WSGI Server
echo "[3/3] Starting Production WSGI Server on http://127.0.0.1:5000..."
exec gunicorn --workers 4 --bind 0.0.0.0:5000 --timeout 60 backend.wsgi:app
