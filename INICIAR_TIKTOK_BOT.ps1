param(
    [switch]$Real,
    [switch]$Test
)

$ErrorActionPreference = "Stop"

if ($Real -and $Test) {
    throw "Use apenas -Real ou -Test, nunca os dois juntos."
}

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root

$runtimeDir = Join-Path $root ".runtime"
$stopPath = Join-Path $runtimeDir "tiktok-bot.stop"
$commandPath = Join-Path $runtimeDir "tiktok-bot.command.json"

New-Item -ItemType Directory -Force -Path $runtimeDir | Out-Null

# Clear only stale controls from the previous execution, before preflight begins.
# Any STOP written after this point belongs to the new execution and must survive
# until the Node runner can observe it.
Remove-Item -LiteralPath $stopPath -Force -ErrorAction SilentlyContinue
Remove-Item -LiteralPath $commandPath -Force -ErrorAction SilentlyContinue

Write-Host ""
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host " TIKTOK BOT - INICIALIZADOR ANDROID" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ""

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    throw "Node.js nao foi encontrado no PATH."
}

if (-not (Get-Command pnpm -ErrorAction SilentlyContinue)) {
    throw "pnpm nao foi encontrado no PATH."
}

if (-not (Get-Command adb -ErrorAction SilentlyContinue)) {
    throw "ADB nao foi encontrado no PATH."
}

$tsx = Join-Path $root "node_modules\.bin\tsx.cmd"

if (-not (Test-Path $tsx)) {
    Write-Host "Dependencias nao encontradas. Executando pnpm install..." -ForegroundColor Yellow
    pnpm install --frozen-lockfile

    if ($LASTEXITCODE -ne 0) {
        throw "pnpm install falhou."
    }
}

$configPath = Join-Path $root "config\tiktok-bot.json"

if (-not (Test-Path $configPath)) {
    throw "Configuracao nao encontrada: $configPath"
}

$config = Get-Content -Raw -LiteralPath $configPath | ConvertFrom-Json
$appiumUrl = if ($config.appiumUrl) { [string]$config.appiumUrl } else { "http://127.0.0.1:4723" }
$appiumStatusUrl = $appiumUrl.TrimEnd("/") + "/status"

function Test-Appium {
    try {
        $response = Invoke-WebRequest -UseBasicParsing -Uri $appiumStatusUrl -TimeoutSec 3
        return ($response.StatusCode -ge 200 -and $response.StatusCode -lt 300)
    }
    catch {
        return $false
    }
}

if (-not (Test-Appium)) {
    $uri = [Uri]$appiumUrl
    $isLocalAppium = @("127.0.0.1", "localhost", "::1") -contains $uri.Host

    if (-not $isLocalAppium) {
        throw "Appium remoto nao respondeu em $appiumUrl"
    }

    if (-not (Get-Command appium -ErrorAction SilentlyContinue)) {
        throw "Appium nao esta rodando e o comando 'appium' nao foi encontrado."
    }

    Write-Host "Appium nao esta aberto. Iniciando automaticamente..." -ForegroundColor Yellow

    Start-Process -FilePath "cmd.exe" -ArgumentList "/k", "appium" -WindowStyle Minimized | Out-Null

    $connected = $false

    for ($i = 0; $i -lt 20; $i++) {
        Start-Sleep -Seconds 1

        if (Test-Appium) {
            $connected = $true
            break
        }
    }

    if (-not $connected) {
        throw "Appium foi iniciado, mas nao respondeu em $appiumUrl."
    }
}

$authorizedDevices = @(
    adb devices |
        Select-Object -Skip 1 |
        ForEach-Object {
            $line = $_.Trim()

            if ($line -match "^(.+?)\s+device$") {
                $Matches[1]
            }
        }
)

if ($authorizedDevices.Count -eq 0) {
    throw "Nenhum celular Android autorizado foi encontrado pelo ADB."
}

Write-Host "ADB: OK" -ForegroundColor Green
Write-Host "Appium: OK ($appiumUrl)" -ForegroundColor Green
Write-Host "Celular(es): $($authorizedDevices -join ', ')" -ForegroundColor Green

if ($Real) {
    $env:TIKTOK_BOT_MODE = "real"
}
elseif ($Test) {
    $env:TIKTOK_BOT_MODE = "test"
}
else {
    $env:TIKTOK_BOT_MODE = "config"
}

$env:TIKTOK_BOT_CONFIG = $configPath

Write-Host ""

if ($env:TIKTOK_BOT_MODE -eq "real") {
    Write-Host "MODO REAL: as acoes habilitadas podem alterar sua conta do TikTok." -ForegroundColor Yellow
}
elseif ($env:TIKTOK_BOT_MODE -eq "test") {
    Write-Host "MODO TESTE: as acoes do TikTok serao simuladas." -ForegroundColor Cyan
}
else {
    Write-Host "Modo definido por config\tiktok-bot.json." -ForegroundColor Cyan
}

Write-Host ""
Write-Host "Iniciando bot..." -ForegroundColor Green
Write-Host ""

& $tsx "scripts\run-tiktok-bot.ts"

$exitCode = $LASTEXITCODE

Remove-Item Env:TIKTOK_BOT_MODE -ErrorAction SilentlyContinue
Remove-Item Env:TIKTOK_BOT_CONFIG -ErrorAction SilentlyContinue

if ($exitCode -ne 0) {
    throw "TikTok bot terminou com exit code $exitCode."
}
