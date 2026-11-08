@echo off
rem Only runs the checks. Does NOT commit or push - do that by hand after reviewing.
cd /d %~dp0
venv\Scripts\python.exe -m pytest -q
if %ERRORLEVEL%==0 (echo CHECK: OK) else (echo CHECK: FAILED)
pause
exit /b %ERRORLEVEL%
