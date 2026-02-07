@echo off
cd /d "%~dp0"
py build.py
cd /d "%~dp0dist"
start "" "http://localhost:8000/"
py -m http.server 8000
