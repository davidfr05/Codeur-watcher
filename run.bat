@echo off
cd /d "%~dp0"
node index.js >> watcher.log 2>&1
