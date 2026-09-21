@echo off
chcp 65001 > nul
echo ========================================================
echo   Stuai AI - Khong Gian Hoc Tap Tinh Lang & Nhip Sinh Hoc
echo ========================================================
echo.
echo [1/3] Khoi dong Backend FastAPI (port 8000)...
cd /d "%~dp0backend"
start "Stuai AI - Backend :8000" cmd /k "python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload"

echo [2/3] Khoi dong Frontend React (port 5173)...
cd /d "%~dp0frontend-react"
start "Stuai AI - Frontend :5173" cmd /k "npm run dev"

echo [3/3] Cho 2 dich vu len xong roi mo trinh duyet...
timeout /t 12 /nobreak > nul
start "" "http://localhost:5173/"

echo.
echo XONG! Backend: http://localhost:8000  -  Frontend: http://localhost:5173/
echo Demo: chau.nguyen@vnuhcm.edu.vn / password123
echo Dong 2 cua so terminal de tat he thong.
pause
