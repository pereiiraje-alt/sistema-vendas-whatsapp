@echo off
title JP Leiloes - WhatsApp Automatico
cd /d "%~dp0"
if not exist node_modules (
  echo Execute instalar.bat primeiro.
  pause
  exit /b 1
)
npm start
pause
