@echo off
setlocal

set "ROOT=C:\sistema-votacao-camara"
set "BACKEND_DIR=%ROOT%\backend"
set "ADMIN_WEB_DIR=%ROOT%\admin-web"

echo ============================================
echo   Iniciando servidores locais - VotaCam
echo ============================================
echo.

if not exist "%BACKEND_DIR%\package.json" (
  echo [ERRO] Backend nao encontrado em: %BACKEND_DIR%
  pause
  exit /b 1
)

if not exist "%ADMIN_WEB_DIR%\package.json" (
  echo [ERRO] Admin-web nao encontrado em: %ADMIN_WEB_DIR%
  pause
  exit /b 1
)

echo [1/2] Iniciando Backend (http://localhost:3000)...
start "VotaCam Backend" cmd /k "cd /d %BACKEND_DIR% && npm run start:dev"

timeout /t 2 /nobreak >nul

echo [2/2] Iniciando Admin Web (http://localhost:3001)...
start "VotaCam Admin Web" cmd /k "cd /d %ADMIN_WEB_DIR% && npm run dev -- -p 3001"

echo.
echo Servidores iniciados em janelas separadas.
echo Backend:   http://localhost:3000
echo Admin Web: http://localhost:3001
echo.
echo Pressione qualquer tecla para fechar esta janela...
pause >nul

endlocal
