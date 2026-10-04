@echo off
title Apuracao de Eleicoes - Capitao Augusto e Dani Alonso
echo =========================================================
echo    APURACAO DE ELEICOES EM TEMPO REAL (TSE / SP)
echo    Destaque: Capitao Augusto (2200) e Dani Alonso (22322)
echo =========================================================
echo.
echo Iniciando o servidor...
cd /d "%~dp0"
start http://localhost:3000
node server.js
pause
