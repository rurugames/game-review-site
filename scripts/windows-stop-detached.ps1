$ErrorActionPreference = 'Stop'

$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$pidFile = Join-Path $root '.server.pid'

if (!(Test-Path $pidFile)) {
  Write-Host 'No .server.pid found. Nothing to stop.'
  exit 0
}

$pidText = Get-Content -Path $pidFile -ErrorAction Stop | Select-Object -First 1
$serverPid = $pidText -as [int]

if (-not $serverPid) {
  Remove-Item -Force $pidFile -ErrorAction SilentlyContinue
  Write-Host 'Invalid pid file removed.'
  exit 0
}

$p = Get-Process -Id $serverPid -ErrorAction SilentlyContinue
if ($p) {
  Stop-Process -Id $serverPid -Force
  Write-Host "Stopped pid=$serverPid"
} else {
  Write-Host "Process pid=$serverPid not found"
}

Remove-Item -Force $pidFile -ErrorAction SilentlyContinue
