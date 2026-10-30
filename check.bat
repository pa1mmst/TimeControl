@echo off
rem Only runs the checks. Does NOT commit or push - do that by hand after reviewing.
cd /d %~dp0
venv\Scripts\python.exe _e2e_check.py > _last_check.txt 2>&1
findstr /c:"PASS" /c:"FAIL" /c:"Error" /c:"Traceback" _last_check.txt
echo.
findstr /b /c:"FAIL " /c:"Traceback" _last_check.txt >nul
if %ERRORLEVEL%==0 (
  echo CHECK: FAILED - see _last_check.txt
  pause
  exit /b 1
)
echo CHECK: OK
pause
exit /b 0
