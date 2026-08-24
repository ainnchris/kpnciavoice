@echo off
setlocal
cd /d "%~dp0"
title KPNC Voice Engine
if not exist ".venv\Scripts\python.exe" (
  echo.
  echo O engine ainda nao foi instalado.
  echo Execute setup_windows.bat primeiro.
  echo.
  pause
  exit /b 1
)
if not exist "seed-vc\inference.py" (
  echo.
  echo A pasta seed-vc nao foi encontrada.
  echo Execute setup_windows.bat novamente.
  echo.
  pause
  exit /b 1
)
echo.
echo KPNC Voice Engine
 echo =================
echo Endereco: http://127.0.0.1:7865
echo Deixe esta janela aberta enquanto usar vozes personalizadas.
echo Pressione CTRL+C para encerrar.
echo.
".venv\Scripts\python.exe" server.py
if errorlevel 1 (
  echo.
  echo O engine encerrou com erro. Rode setup_windows.bat novamente se houver dependencias ausentes.
  pause
)
endlocal
