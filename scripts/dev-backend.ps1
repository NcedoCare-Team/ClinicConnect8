# ─────────────────────────────────────────────────────────────────────────────
# Start the NcedoCare backend + a public tunnel, then point the mobile app at it.
#
#   1. runs  models/server/app.py        (Flask, port 5000)
#   2. runs  cloudflared quick tunnel    (https://<random>.trycloudflare.com)
#   3. writes EXPO_PUBLIC_API_URL=<tunnel url> into .env
#
# Campus / eduroam Wi-Fi blocks QUIC (UDP 7844), so the tunnel is forced onto
# HTTP/2 over TCP 443, which those networks allow.
#
# After this prints "READY", start the app in another terminal:
#     npx expo start --clear
#
# Leave this window open while testing. Ctrl+C stops both the server and tunnel.
# The tunnel URL changes every run, so re-run this + `expo start --clear` each session.
# ─────────────────────────────────────────────────────────────────────────────

$ErrorActionPreference = 'Stop'
$repoRoot  = Resolve-Path (Join-Path $PSScriptRoot '..')
$serverDir = Join-Path $repoRoot 'models\server'
$envFile   = Join-Path $repoRoot '.env'

# --- locate cloudflared -------------------------------------------------------
$cf = (Get-Command cloudflared -ErrorAction SilentlyContinue).Source
if (-not $cf) {
    foreach ($p in @(
        "$env:ProgramFiles\cloudflared\cloudflared.exe",
        "${env:ProgramFiles(x86)}\cloudflared\cloudflared.exe"
    )) { if (Test-Path $p) { $cf = $p; break } }
}
if (-not $cf) {
    Write-Error "cloudflared not found. Install it with:  winget install --id Cloudflare.cloudflared"
}

# --- locate python ----------------------------------------------------------
$py = (Get-Command python -ErrorAction SilentlyContinue).Source
if (-not $py) { $py = (Get-Command py -ErrorAction SilentlyContinue).Source }
if (-not $py) { Write-Error "python not found on PATH." }

$logDir = Join-Path $env:TEMP 'ncedo-dev'
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$flaskLog = Join-Path $logDir 'flask.log'
$cfLog    = Join-Path $logDir 'cloudflared.log'
Remove-Item $flaskLog, $cfLog -ErrorAction SilentlyContinue

Write-Host "Starting Flask backend..." -ForegroundColor Cyan
$flask = Start-Process -FilePath $py -ArgumentList 'app.py' -WorkingDirectory $serverDir `
    -RedirectStandardOutput $flaskLog -RedirectStandardError "$flaskLog.err" `
    -NoNewWindow -PassThru

Start-Sleep -Seconds 4
try {
    (Invoke-WebRequest -Uri 'http://127.0.0.1:5000/health' -TimeoutSec 5 -UseBasicParsing).StatusCode | Out-Null
    Write-Host "  backend healthy on http://127.0.0.1:5000" -ForegroundColor Green
} catch {
    Write-Warning "  backend not answering yet - check $flaskLog"
}

Write-Host "Starting cloudflared tunnel (http2)..." -ForegroundColor Cyan
$tunnel = Start-Process -FilePath $cf `
    -ArgumentList 'tunnel','--url','http://localhost:5000','--protocol','http2' `
    -RedirectStandardOutput $cfLog -RedirectStandardError "$cfLog.err" `
    -NoNewWindow -PassThru

# --- wait for the public URL ------------------------------------------------
$url = $null
for ($i = 0; $i -lt 30; $i++) {
    Start-Sleep -Seconds 1
    foreach ($f in @($cfLog, "$cfLog.err")) {
        if (Test-Path $f) {
            $m = Select-String -Path $f -Pattern 'https://[a-z0-9-]+\.trycloudflare\.com' -ErrorAction SilentlyContinue | Select-Object -First 1
            if ($m) { $url = $m.Matches[0].Value; break }
        }
    }
    if ($url) { break }
}
if (-not $url) {
    Stop-Process -Id $flask.Id, $tunnel.Id -Force -ErrorAction SilentlyContinue
    Write-Error "Tunnel URL not found - check $cfLog"
}

# --- wait until the tunnel actually serves ---------------------------------
$ok = $false
for ($i = 0; $i -lt 20; $i++) {
    try {
        $r = Invoke-WebRequest -Uri "$url/health" -TimeoutSec 8 -UseBasicParsing
        if ($r.StatusCode -eq 200) { $ok = $true; break }
    } catch { Start-Sleep -Seconds 2 }
}

# --- patch .env -----------------------------------------------------------
$lines = @()
if (Test-Path $envFile) { $lines = Get-Content $envFile }
if ($lines -match '^\s*EXPO_PUBLIC_API_URL=') {
    $lines = $lines -replace '^\s*EXPO_PUBLIC_API_URL=.*', "EXPO_PUBLIC_API_URL=$url"
} else {
    $lines += "EXPO_PUBLIC_API_URL=$url"
}
Set-Content -Path $envFile -Value $lines -Encoding utf8

Write-Host ""
Write-Host "──────────────────────────────────────────────" -ForegroundColor DarkGray
if ($ok) { Write-Host "READY" -ForegroundColor Green } else { Write-Host "TUNNEL UP (health check slow - try anyway)" -ForegroundColor Yellow }
Write-Host "  API  : $url" -ForegroundColor White
Write-Host "  .env : EXPO_PUBLIC_API_URL updated" -ForegroundColor White
Write-Host ""
Write-Host "  Next: in another terminal ->  npx expo start --clear" -ForegroundColor White
Write-Host "──────────────────────────────────────────────" -ForegroundColor DarkGray
Write-Host "Press Ctrl+C to stop the backend + tunnel." -ForegroundColor DarkGray

try {
    Wait-Process -Id $tunnel.Id
} finally {
    Stop-Process -Id $flask.Id, $tunnel.Id -Force -ErrorAction SilentlyContinue
    Write-Host "`nStopped backend + tunnel." -ForegroundColor Cyan
}
