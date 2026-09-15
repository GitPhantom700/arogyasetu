@echo off
setlocal enabledelayedexpansion

echo ==============================================================================
echo   ArogyaSetu — 1-Click Evaluator Runner
echo   Healthcare Supply Chain ^& Emergency Logistics Platform
echo   Build with AI: Code for Communities (Second Edition)
echo ==============================================================================
echo.

cd /d "%~dp0"

:: 1. Check Python installation
where python >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Python was not found on PATH. Please install Python 3.10+ and re-run.
    pause
    exit /b 1
)

:: 2. Set up virtual environment if missing
if not exist ".venv\Scripts\activate.bat" (
    echo [SETUP] Virtual environment not found. Creating .venv...
    python -m venv .venv
    echo [SETUP] Installing backend dependencies from requirements.txt...
    call .venv\Scripts\activate.bat
    python -m pip install --upgrade pip
    pip install -r requirements.txt
) else (
    call .venv\Scripts\activate.bat
)

:: 3. Check frontend production build
if not exist "frontend\dist\index.html" (
    echo [BUILD] Compiled frontend bundle not found. Building React application...
    where npm >nul 2>nul
    if %errorlevel% equ 0 (
        cd frontend
        call npm install --silent
        call npm run build
        cd ..
    ) else (
        echo [WARNING] npm not found. Serving fallback documentation view.
    )
)

echo.
echo ==============================================================================
echo   Server is launching at: http://localhost:8000
echo   API Documentation (Swagger): http://localhost:8000/docs
echo   Executive Audit Report: http://localhost:8000/report
echo ==============================================================================
echo.
echo Press Ctrl+C to stop the server.
echo.

:: 4. Launch browser after 2 seconds in the background
start "" cmd /c "timeout /t 2 >nul && start http://localhost:8000"

:: 5. Start unified FastAPI server
python -m uvicorn backend.main:app --host 0.0.0.0 --port 8000

pause
