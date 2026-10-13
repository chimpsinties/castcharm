$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $repoRoot

$env:DATABASE_URL = 'sqlite:///./data/castcharm-personal.db'
$env:DEFAULT_DOWNLOAD_PATH = './downloads-personal'
$env:CLEAN_RSS_PATH = './downloads-personal/clean-rss'

Write-Host 'CastCharm personal server: http://127.0.0.1:8002'
Write-Host 'Database: data/castcharm-personal.db'
Write-Host 'Downloads: downloads-personal'

& .\.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8002