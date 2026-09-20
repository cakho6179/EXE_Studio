@echo off
chcp 65001 > nul
echo ========================================================
echo   Stuđiô AI - Không Gian Học Tập Tĩnh Lặng & Nhịp Sinh Học
echo ========================================================
echo.
echo Đang khởi động Backend FastAPI & Frontend Web App...
cd /d "%~dp0backend"

start "" "http://localhost:8000"
python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload

pause
