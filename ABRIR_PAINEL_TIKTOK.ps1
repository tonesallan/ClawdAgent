$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root

Write-Host ""
Write-Host "=== TIKTOK BOT - PAINEL ===" -ForegroundColor Cyan

$script = Join-Path $root "painel_tiktok.py"

if (-not (Test-Path $script)) {
    throw "Painel nao encontrado: $script"
}

$python = $null
$arguments = @()

if (Get-Command py -ErrorAction SilentlyContinue) {
    $python = "py"
    $arguments = @("-3", $script)
}
elseif (Get-Command python -ErrorAction SilentlyContinue) {
    $python = "python"
    $arguments = @($script)
}
else {
    throw "Python 3 nao foi encontrado. Instale Python 3 ou adicione py/python ao PATH."
}

& $python @arguments

if ($LASTEXITCODE -ne 0) {
    throw "O painel TikTok terminou com exit code $LASTEXITCODE."
}
