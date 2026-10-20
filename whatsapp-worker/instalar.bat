@echo off
title JP Leiloes - Instalador WhatsApp
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo O Node.js nao esta instalado neste computador.
  echo Instale a versao LTS em https://nodejs.org e execute este arquivo novamente.
  echo.
  pause
  exit /b 1
)
echo Instalando o conector do WhatsApp...
call npm install
if errorlevel 1 (
  echo Falha na instalacao.
  pause
  exit /b 1
)
echo.
echo Instalacao concluida.
echo Agora execute iniciar.bat
pause
