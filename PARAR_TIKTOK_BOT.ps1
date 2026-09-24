$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$runtimeDir = Join-Path $root ".runtime"
$statusPath = Join-Path $runtimeDir "tiktok-bot.status.json"
$stopPath = Join-Path $runtimeDir "tiktok-bot.stop"

Write-Host ""
Write-Host "=== PARANDO TIKTOK BOT ===" -ForegroundColor Yellow

if (-not (Test-Path $runtimeDir)) {
    Write-Host "Nenhuma execucao do bot foi encontrada." -ForegroundColor DarkGray
    exit 0
}

$status = $null

if (Test-Path $statusPath) {
    try {
        $status = Get-Content -Raw -LiteralPath $statusPath | ConvertFrom-Json
    }
    catch {
        $status = $null
    }
}

# Register the STOP request first. The status file can still contain "stopped"
# from the previous run while a new launcher is in preflight/startup.
Set-Content -LiteralPath $stopPath -Value "stop" -Encoding UTF8

if ($status -and $status.state -eq "stopped") {
    Write-Host "Sinal de parada registrado. Se o bot estiver iniciando, ele sera interrompido assim que o runner assumir." -ForegroundColor Green
    exit 0
}

for ($i = 0; $i -lt 30; $i++) {
    Start-Sleep -Milliseconds 500

    if (Test-Path $statusPath) {
        try {
            $current = Get-Content -Raw -LiteralPath $statusPath | ConvertFrom-Json

            if ($current.state -eq "stopped") {
                Write-Host "TikTok bot parado com seguranca." -ForegroundColor Green
                exit 0
            }
        }
        catch {
            # O arquivo pode estar sendo atualizado pelo processo do bot.
        }
    }
}

Write-Host "Pedido de parada enviado. O processo ainda nao confirmou o encerramento." -ForegroundColor Yellow
Write-Host "Verifique com .\STATUS_TIKTOK_BOT.ps1" -ForegroundColor Yellow
