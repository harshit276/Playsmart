@echo off
REM ================================================================
REM  Atheonics one-click deploy
REM  Double-click this file (or run `deploy.bat` in a terminal).
REM  It builds the frontend (so a typo can't ship a broken site),
REM  commits any changes, and pushes — which triggers Vercel's
REM  automatic deploy.
REM
REM  BRANCH: edit the line below.
REM    set BRANCH=main                -> deploys PRODUCTION (atheonics.com)
REM    set BRANCH=fix/upload-resilience -> Vercel PREVIEW url (safe)
REM ================================================================

set BRANCH=fix/upload-resilience

cd /d "%~dp0"

REM --- Clear any stale git lock (common when the repo lives in OneDrive). ---
REM Safe as long as no other git process is genuinely running. Close any open
REM Git GUI / other deploy windows before running this.
if exist ".git\index.lock" (
  echo Removing stale git lock...
  del /f /q ".git\index.lock" 2>nul
)

echo.
echo === [1/4] Building frontend (this gates the deploy) ===
pushd frontend
REM package.json uses Unix env syntax (CI=false craco build) which Windows
REM cmd can't parse, so set CI the Windows way and call the local craco
REM binary directly (node_modules\.bin\craco.cmd) instead of via npx.
set "CI=false"
if not exist "node_modules\.bin\craco.cmd" (
  echo Dependencies missing — running npm install first ^(one-time, takes a few min^)...
  call npm install
)
call "node_modules\.bin\craco.cmd" build
if errorlevel 1 (
  echo.
  echo BUILD FAILED — nothing was pushed. Fix the error above and re-run.
  popd
  pause
  exit /b 1
)
popd

echo.
echo === [2/4] Switching to branch %BRANCH% and ensuring git identity ===
REM git refuses to commit without an author identity — set one if missing.
for /f "delims=" %%i in ('git config user.email') do set GITEMAIL=%%i
if "%GITEMAIL%"=="" (
  echo No git identity found — setting it now...
  git config user.email "mundraharshit1999@gmail.com"
  git config user.name "harshit"
)
git rev-parse --verify %BRANCH% >nul 2>&1
if errorlevel 1 (
  git checkout -b %BRANCH%
) else (
  git checkout %BRANCH%
)

echo.
echo === [3/4] Committing the changed files ===
REM Stage ONLY the files we actually edited (avoids sweeping the whole repo,
REM which shows as changed only because of Windows CRLF line endings).
git add frontend/src/lib/cloudinaryUpload.js frontend/src/lib/geminiDirectUpload.js frontend/src/lib/webcodecsTranscode.js frontend/src/lib/transcode.worker.js frontend/src/lib/transcodeInWorker.js frontend/src/lib/videoRotation.js frontend/src/pages/AnalyzePage.jsx frontend/src/pages/ProgressPage.jsx frontend/src/components/LiveVoiceCoach.jsx backend/server.py backend/ai_pipeline/vlm/coaching.py CLAUDE.md ANALYZE_FEATURE_EVALUATION.md UPLOAD_SPEED_RESEARCH.md deploy.bat
git commit -m "Upload speed: worker-based 720p transcode (desktop too) + backend Cloudinary-to-Gemini streaming + wake lock"
if errorlevel 1 (
  echo.
  echo Nothing was committed ^(no changes detected, or commit failed above^).
  echo If it says 'nothing to commit', the code may already be committed — continuing to push.
)

echo.
echo === [4/4] Pushing to origin/%BRANCH% (triggers Vercel deploy) ===
git push -u origin %BRANCH%
if errorlevel 1 (
  echo.
  echo PUSH FAILED — you may need to sign in to GitHub once.
  echo Tip: install GitHub Desktop, or run: git push   and approve the browser login.
  pause
  exit /b 1
)

echo.
echo ============================================================
echo  Done. Vercel is now building. Check your Vercel dashboard
echo  for the deploy URL (a PREVIEW url unless BRANCH=main).
echo ============================================================
pause
