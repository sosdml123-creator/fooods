@echo off
echo ==============================================
echo  Plating App - GitHub Push Authorization Tool
echo ==============================================
echo.
echo Proceeding to push local updates to GitHub...
echo If a GitHub login window pops up, please authorize it.
echo.
cd /d d:\food
git push origin main
echo.
echo ==============================================
echo  Push complete! Press any key to close.
echo ==============================================
pause
