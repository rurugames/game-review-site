param(
  [int]$Port = 3000
)

$ErrorActionPreference = 'Stop'

$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$pidFile = Join-Path $root '.server.pid'

$pidOk = $false
$serverPid = $null
if (Test-Path $pidFile) {
  try {
    $pidText = Get-Content -Path $pidFile -ErrorAction Stop | Select-Object -First 1
    $serverPid = $pidText -as [int]
    if ($serverPid) {
      $p = Get-Process -Id $serverPid -ErrorAction SilentlyContinue
      if ($p) { $pidOk = $true }
    }
  } catch {}
}

$healthOk = $false
try {
  $resp = Invoke-WebRequest -UseBasicParsing ("http://localhost:$Port/healthz") -TimeoutSec 2
  if ($resp.StatusCode -eq 200 -and ($resp.Content -match 'ok')) { $healthOk = $true }
} catch {}

if ($pidOk -or $healthOk) {
  Write-Host ("RUNNING pid=" + ($serverPid ? $serverPid : '-') + " healthz=" + $healthOk)
  exit 0
}

Write-Host 'NOT_RUNNING'
exit 1
