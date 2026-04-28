@echo off
setlocal enabledelayedexpansion

title KSB Flasher Installer
echo.
echo  ============================================
echo   KSB Flasher - SmartNIC Firmware Terminal
echo   Windows Installer
echo  ============================================
echo.

:: ── Configuration ──────────────────────────────────────────────
set "INSTALL_DIR=%LOCALAPPDATA%\KSB_Flasher"
set "PYTHON_VER=3.12.7"
set "PYTHON_URL=https://www.python.org/ftp/python/%PYTHON_VER%/python-%PYTHON_VER%-embed-amd64.zip"
set "PIP_URL=https://bootstrap.pypa.io/get-pip.py"
set "SCRIPT_DIR=%~dp0"

:: ── Parse arguments ──────────────────────────────────────────────
set "DO_UPDATE=0"
if /i "%~1"=="--update" set "DO_UPDATE=1"
if /i "%~1"=="-u"       set "DO_UPDATE=1"
if /i "%~1"=="update"   set "DO_UPDATE=1"

if "%DO_UPDATE%"=="1" (
    echo  Mode: UPDATE - clean reinstall, preserving history
    echo.

    :: Kill running instance
    taskkill /f /im KSB_Flasher.exe >nul 2>&1
    timeout /t 2 /nobreak >nul 2>&1

    :: Back up user data
    if exist "%INSTALL_DIR%\connection_history.json" (
        copy /y "%INSTALL_DIR%\connection_history.json" "%TEMP%\ksb_history_backup.json" >nul 2>&1
        echo  Backed up connection history.
    )
    if exist "%INSTALL_DIR%\logs" (
        xcopy /y /s /i "%INSTALL_DIR%\logs" "%TEMP%\ksb_logs_backup" >nul 2>&1
        echo  Backed up session logs.
    )

    :: Remove old installation
    echo  Removing old installation...
    rmdir /s /q "%INSTALL_DIR%" >nul 2>&1
    echo  Old installation removed.
    echo.
)

:: ── Create install directory ───────────────────────────────────
echo [1/7] Creating install directory...
if not exist "%INSTALL_DIR%" mkdir "%INSTALL_DIR%"
if not exist "%INSTALL_DIR%\_python" mkdir "%INSTALL_DIR%\_python"

:: ── Restore user data if updating ──────────────────────────────
if "%DO_UPDATE%"=="1" (
    if exist "%TEMP%\ksb_history_backup.json" (
        copy /y "%TEMP%\ksb_history_backup.json" "%INSTALL_DIR%\connection_history.json" >nul 2>&1
        del "%TEMP%\ksb_history_backup.json" >nul 2>&1
    )
    if exist "%TEMP%\ksb_logs_backup" (
        xcopy /y /s /i "%TEMP%\ksb_logs_backup" "%INSTALL_DIR%\logs" >nul 2>&1
        rmdir /s /q "%TEMP%\ksb_logs_backup" >nul 2>&1
    )
    echo       Restored user data.
)

:: ── Download embedded Python ───────────────────────────────────
echo [2/7] Downloading Python %PYTHON_VER% (embeddable)...
if exist "%INSTALL_DIR%\_python\python.exe" (
    echo       Python already present, skipping.
) else (
    powershell -NoProfile -Command "Invoke-WebRequest -Uri '%PYTHON_URL%' -OutFile '%TEMP%\python-embed.zip' -UseBasicParsing" >nul 2>&1
    if errorlevel 1 (
        echo ERROR: Failed to download Python. Check your internet connection.
        pause
        exit /b 1
    )
    echo       Extracting...
    powershell -NoProfile -Command "Expand-Archive -Path '%TEMP%\python-embed.zip' -DestinationPath '%INSTALL_DIR%\_python' -Force" >nul 2>&1
    del "%TEMP%\python-embed.zip" >nul 2>&1
)

:: ── Enable pip in embedded Python ──────────────────────────────
echo [3/7] Configuring pip...
for %%f in ("%INSTALL_DIR%\_python\python*._pth") do (
    powershell -NoProfile -Command "(Get-Content '%%f') -replace '#import site','import site' | Set-Content '%%f'" >nul 2>&1
)

if not exist "%INSTALL_DIR%\_python\Lib\site-packages\pip" (
    powershell -NoProfile -Command "Invoke-WebRequest -Uri '%PIP_URL%' -OutFile '%TEMP%\get-pip.py' -UseBasicParsing" >nul 2>&1
    "%INSTALL_DIR%\_python\python.exe" "%TEMP%\get-pip.py" --no-warn-script-location >nul 2>&1
    del "%TEMP%\get-pip.py" >nul 2>&1
)

:: ── Install dependencies ───────────────────────────────────────
echo [4/7] Installing dependencies (aiohttp, asyncssh, pyinstaller)...
"%INSTALL_DIR%\_python\python.exe" -m pip install aiohttp asyncssh pyinstaller --no-warn-script-location --quiet >nul 2>&1
if errorlevel 1 (
    echo ERROR: Failed to install dependencies.
    pause
    exit /b 1
)

:: ── Copy application files ─────────────────────────────────────
echo [5/7] Copying application files...
copy /y "%SCRIPT_DIR%app.py" "%INSTALL_DIR%\app.py" >nul 2>&1
copy /y "%SCRIPT_DIR%requirements.txt" "%INSTALL_DIR%\requirements.txt" >nul 2>&1
copy /y "%SCRIPT_DIR%ksb_flasher.spec" "%INSTALL_DIR%\ksb_flasher.spec" >nul 2>&1
xcopy /y /s /i "%SCRIPT_DIR%static" "%INSTALL_DIR%\static" >nul 2>&1

:: ── Build .exe ─────────────────────────────────────────────────
echo [6/7] Building KSB_Flasher.exe (this takes ~30 seconds)...
taskkill /f /im KSB_Flasher.exe >nul 2>&1
pushd "%INSTALL_DIR%"
"%INSTALL_DIR%\_python\python.exe" -m PyInstaller ksb_flasher.spec --clean --noconfirm >nul 2>&1
popd
if errorlevel 1 (
    echo ERROR: Build failed. Try running this script again.
    pause
    exit /b 1
)

:: ── Create desktop shortcut ────────────────────────────────────
echo [7/7] Creating desktop shortcut...
powershell -NoProfile -Command "$d=[Environment]::GetFolderPath('Desktop'); $ws=New-Object -ComObject WScript.Shell; $sc=$ws.CreateShortcut(\"$d\KSB Flasher.lnk\"); $sc.TargetPath='%INSTALL_DIR%\dist\KSB_Flasher.exe'; $sc.WorkingDirectory='%INSTALL_DIR%\dist'; $sc.Save()" >nul 2>&1

:: ── Done ───────────────────────────────────────────────────────
echo.
echo  ============================================
if "%DO_UPDATE%"=="1" (
    echo   Update complete
) else (
    echo   Installation complete
)
echo.
echo   EXE:      %INSTALL_DIR%\dist\KSB_Flasher.exe
echo   Shortcut: Desktop\KSB Flasher
echo.
echo   To update later, run: install.bat --update
echo  ============================================
echo.
echo  Press any key to launch KSB Flasher...
pause >nul
start "" "%INSTALL_DIR%\dist\KSB_Flasher.exe"
