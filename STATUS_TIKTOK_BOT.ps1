$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$statusPath = Join-Path $root ".runtime\tiktok-bot.status.json"

Write-Host ""
Write-Host "=== STATUS TIKTOK BOT ===" -ForegroundColor Cyan

if (-not (Test-Path $statusPath)) {
    Write-Host "Nenhum status foi criado ainda." -ForegroundColor DarkGray
    exit 0
}

try {
    $status = Get-Content -Raw -LiteralPath $statusPath | ConvertFrom-Json
}
catch {
    throw "Nao foi possivel ler $statusPath"
}

Write-Host "Estado:       $($status.state)"
Write-Host "Modo:         $($status.mode)"
Write-Host "PID:          $($status.pid)"
Write-Host "Celular:      $($status.deviceId)"
Write-Host "Appium:       $($status.appiumUrl)"
Write-Host "Acoes:        $($status.actions -join ', ')"
Write-Host "Atual:        $($status.currentAction)"
Write-Host "Ultima acao:  $($status.lastAction)"
Write-Host "Proxima:      $($status.nextActionTime)"
Write-Host "Ultimo erro:  $($status.lastError)"
Write-Host ""
Write-Host "Contadores:"
Write-Host "  Scrolls:     $($status.stats.scrolls)"
Write-Host "  Likes:       $($status.stats.likes)"
Write-Host "  Comentarios: $($status.stats.comments)"
Write-Host "  Follows:     $($status.stats.follows)"
Write-Host "  Shares:      $($status.stats.shares)"
Write-Host "  Erros:       $($status.stats.errors)"
Write-Host "  Total:       $($status.stats.totalActions)"
Write-Host "  Nesta hora:  $($status.stats.actionsThisHour)"

if ($status.automationCore) {
    Write-Host ""
    Write-Host "Automation Core:"
    Write-Host "  Estado:      $($status.automationCore.state)"
    Write-Host "  Tick ativo:  $($status.automationCore.tickActive)"
    Write-Host "  Ultimo tick: $($status.automationCore.lastRunCompletedAt)"
    Write-Host "  Follow-back: $($status.followBackCheckHours) horas"
}
