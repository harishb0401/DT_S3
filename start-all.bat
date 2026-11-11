@echo off
title College Bus Pass Verification System Launcher
echo ========================================================
echo Starting College Bus Pass Verification System
echo ========================================================

REM 1. Start AI Service (Python FastAPI + DeepFace)
start "1. AI Service (Port 8000)" cmd /k "cd /d "%~dp0ai-service" && call start.bat"

REM 2. Start Backend (Node.js Express + MongoDB)
start "2. Backend API (Port 5000)" cmd /k "cd /d "%~dp0backend" && npm run dev"

REM 3. Start Frontend (React + Vite)
start "3. Frontend (Port 5173)" cmd /k "cd /d "%~dp0frontend" && npm run dev"

echo.
echo All services launched!
echo - Frontend:    http://localhost:3000
echo - Backend API: http://localhost:5000
echo - AI Service:  http://127.0.0.1:8000
echo.
