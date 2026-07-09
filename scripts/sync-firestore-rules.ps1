# Sync shared Firestore rules + indexes from NcedoCare (mobile) to NcedoCare-web.
# Run after any firestore.rules or firestore.indexes.json change.

$ErrorActionPreference = 'Stop'

$mobileRoot = Resolve-Path (Join-Path $PSScriptRoot '..')
$webRoot = Join-Path (Split-Path $mobileRoot -Parent) 'NcedoCare-web'

if (-not (Test-Path $webRoot)) {
    Write-Error "NcedoCare-web not found at: $webRoot"
}

$files = @(
    @{ Name = 'firestore.rules'; Required = $true },
    @{ Name = 'firestore.indexes.json'; Required = $true }
)

foreach ($file in $files) {
    $source = Join-Path $mobileRoot $file.Name
    $dest = Join-Path $webRoot $file.Name

    if (-not (Test-Path $source)) {
        if ($file.Required) { Write-Error "Missing source file: $source" }
        continue
    }

    Copy-Item -Path $source -Destination $dest -Force
    Write-Host "Synced $($file.Name) -> $dest"
}

# Verify rules match
$mobileRules = Get-Content (Join-Path $mobileRoot 'firestore.rules') -Raw
$webRules = Get-Content (Join-Path $webRoot 'firestore.rules') -Raw
if ($mobileRules -ne $webRules) {
    Write-Error 'firestore.rules files differ after sync!'
}

Write-Host 'Firestore rules and indexes are in sync across both repos.'
