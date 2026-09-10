@echo off
cd /d D:\TimeControl
venv\Scripts\python.exe _e2e_check.py > _last_check.txt 2>&1
findstr /c:"PASS" /c:"FAIL" /c:"Error" /c:"Traceback" _last_check.txt
git add -A
git commit -m "step1: actor from verified initData + isolated e2e db"
git push
pause
