@echo off
REM Double-click on Windows to start O.T.T.E.R. as a small helper window.
cd /d "%~dp0.."
if not exist node_modules call npm install
npm run helper
