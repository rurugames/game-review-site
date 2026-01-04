param(
  [int]$Port = 3000,
  [switch]$DebugExit
)

$ErrorActionPreference = 'Stop'

$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$pidFile = Join-Path $root '.server.pid'

if (Test-Path $pidFile) {
  try {
    $oldPid = Get-Content -Path $pidFile -ErrorAction Stop | Select-Object -First 1
    if ($oldPid -and ($oldPid -as [int])) {
      $p = Get-Process -Id ([int]$oldPid) -ErrorAction SilentlyContinue
      if ($p) {
        Write-Host "Already running (pid=$oldPid). Stop it first: npm run stop:detached" 
        exit 0
      }
    }
  } catch {}
}

$env:PORT = "$Port"
if ($DebugExit) { $env:DEBUG_PROCESS_EXIT = '1' }

$proc = Start-Process -FilePath 'node' -ArgumentList @('server.js') -WorkingDirectory $root -PassThru -WindowStyle Normal
$proc.Id | Out-File -FilePath $pidFile -Encoding ascii -Force

Write-Host "Started server.js detached. pid=$($proc.Id) url=http://localhost:$Port" 
