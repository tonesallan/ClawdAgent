$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$runtime = Join-Path $root ".runtime"
$commandPath = Join-Path $runtime "tiktok-bot.command.json"

New-Item -ItemType Directory -Force -Path $runtime | Out-Null

@{
    command = "resume"
    requestedAt = (Get-Date).ToString("o")
    source = "powershell"
} | ConvertTo-Json | Set-Content -LiteralPath $commandPath -Encoding UTF8

Write-Host "Comando RESUME enviado ao TikTok Bot." -ForegroundColor Green
