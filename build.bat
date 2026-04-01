@echo off
cd /d %~dp0

echo [1/3] Building...
pyinstaller Finder.spec
if errorlevel 1 (
    echo Build failed.
    exit /b 1
)

echo [2/3] Deploying to C:\apps\Finder\...
rd /s /q C:\apps\Finder.old 2>nul
ren C:\apps\Finder Finder.old 2>nul
robocopy dist\Finder C:\apps\Finder /E /NJH /NJS
if errorlevel 8 (
    echo Deploy failed. Rolling back...
    rd /s /q C:\apps\Finder 2>nul
    ren C:\apps\Finder.old Finder 2>nul
    exit /b 1
)
rd /s /q C:\apps\Finder.old 2>nul

echo [3/3] Done. Restart app to apply changes.
