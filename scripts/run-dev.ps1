$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $repoRoot

$env:DATABASE_URL = 'sqlite:///./data/castcharm-dev.db'
$env:DEFAULT_DOWNLOAD_PATH = './downloads-dev'
$env:CLEAN_RSS_PATH = './downloads-dev/clean-rss'

Write-Host 'CastCharm dev server: http://127.0.0.1:8001'
Write-Host 'Database: data/castcharm-dev.db'
Write-Host 'Downloads: downloads-dev'

& .\.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8001