@echo off
REM Start the local DeepFace face-recognition service (CPU only, fully offline).
cd /d "%~dp0"
if exist "venv\Scripts\python.exe" (
    venv\Scripts\python.exe main.py
) else (
    python main.py
)
pause
