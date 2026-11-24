@echo off
chcp 65001 >nul
cd /d "%~dp0"
title HISCHOOL
where node >nul 2>nul || (echo Node.js topilmadi. https://nodejs.org saytidan ornating. & pause & exit /b 1)
if not exist node_modules call npm install
set HS_OPEN=1
call npm run start
pause
