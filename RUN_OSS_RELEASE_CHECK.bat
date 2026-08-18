@echo off
setlocal
cd /d "%~dp0"

powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\oss-release-check.ps1"
set "CHECK_RESULT=%ERRORLEVEL%"

echo.
if not "%CHECK_RESULT%"=="0" (
  echo OSS release check FAILED. Copy this window's error message when asking for help.
) else (
  echo OSS release check PASSED.
  echo Send AI-Ensemble-v1.3.4-OSS-VERIFIED-SOURCE.zip back for the final publication audit.
)
echo.
pause
exit /b %CHECK_RESULT%
