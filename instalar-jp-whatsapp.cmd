@echo off
setlocal
title JP Leiloes - Instalador WhatsApp
set "DIR=%USERPROFILE%\JP-Leiloes-WhatsApp"
set "BASE=https://www.jpleiloes.com.br/whatsapp-worker"
echo.
echo JP LEILOES - WHATSAPP AUTOMATICO
echo =================================
echo.
where node >nul 2>nul
if errorlevel 1 (
  echo O Node.js ainda nao esta instalado.
  echo.
  start "" "https://nodejs.org/en/download"
  echo Instale a versao LTS do Node.js e execute este instalador novamente.
  pause
  exit /b 1
)
if not exist "%DIR%" mkdir "%DIR%"
echo Baixando arquivos...
powershell -NoProfile -ExecutionPolicy Bypass -Command "Invoke-WebRequest -UseBasicParsing '%BASE%/package.json' -OutFile '%DIR%\package.json'; Invoke-WebRequest -UseBasicParsing '%BASE%/index.js' -OutFile '%DIR%\index.js'; Invoke-WebRequest -UseBasicParsing '%BASE%/iniciar.bat' -OutFile '%DIR%\iniciar.bat'; Invoke-WebRequest -UseBasicParsing '%BASE%/LEIA-ME.txt' -OutFile '%DIR%\LEIA-ME.txt'"
if errorlevel 1 (
  echo Falha ao baixar os arquivos do JP Leiloes.
  pause
  exit /b 1
)
cd /d "%DIR%"
echo Instalando dependencias...
call npm install
if errorlevel 1 (
  echo Falha ao instalar dependencias.
  pause
  exit /b 1
)
powershell -NoProfile -ExecutionPolicy Bypass -Command "$s=(New-Object -COM WScript.Shell).CreateShortcut([Environment]::GetFolderPath('Desktop')+'\JP Leiloes WhatsApp.lnk');$s.TargetPath='%DIR%\iniciar.bat';$s.WorkingDirectory='%DIR%';$s.Save()"
echo.
echo Instalacao concluida.
echo Foi criado o atalho "JP Leiloes WhatsApp" na Area de Trabalho.
echo.
start "" "%DIR%\iniciar.bat"
pause
