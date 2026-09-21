$ErrorActionPreference = "Stop"

$Repo = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$Branch = "feature/android-tiktok-local"

Set-Location $Repo

$env:GIT_PAGER = "cat"
$env:GH_PAGER = "cat"
$env:PAGER = "cat"
git config --local core.pager cat

function Invoke-FinalStep {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Name,

        [Parameter(Mandatory = $true)]
        [scriptblock]$Action
    )

    Write-Host ""
    Write-Host "============================================================" -ForegroundColor Cyan
    Write-Host " $Name"
    Write-Host "============================================================" -ForegroundColor Cyan

    $Started = Get-Date

    & $Action

    if ($LASTEXITCODE -ne 0) {
        throw "$Name falhou com exit code $LASTEXITCODE."
    }

    $Elapsed = (Get-Date) - $Started

    Write-Host (
        "[PASS] {0} ({1:n1}s)" -f
        $Name,
        $Elapsed.TotalSeconds
    ) -ForegroundColor Green
}

Write-Host ""
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host " CLAWDAGENT TIKTOK - VALIDACAO FINAL ANDROID-ONLY"
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "TikTok Web/Playwright NAO sera usado."
Write-Host "Nenhum navegador sera aberto."
Write-Host "O unico smoke real abre o app TikTok no celular via Appium."
Write-Host "Nenhum Follow, Unfollow, Like, Comment, Share ou DM sera executado pelo smoke real."
Write-Host ""

if ((git branch --show-current).Trim() -ne $Branch) {
    throw "Branch incorreta. Esperado: $Branch"
}

$Unexpected = @(
    git status --porcelain |
    Where-Object {
        $_ -notmatch "backups/phase13_atomic_creation_20260917_115951"
    }
)

if ($Unexpected.Count -gt 0) {
    $Unexpected
    throw "Existem alteracoes locais inesperadas antes da validacao final."
}

Write-Host "[PASS] Pre-flight / working tree." -ForegroundColor Green

$AdbOutput = adb devices

if ($LASTEXITCODE -ne 0) {
    throw "ADB nao esta disponivel."
}

$ConnectedDevices = @(
    $AdbOutput |
    Select-Object -Skip 1 |
    ForEach-Object {
        $Line = $_.Trim()

        if ($Line -match "^(\S+)\s+device$") {
            $Matches[1]
        }
    }
)

if ($ConnectedDevices.Count -eq 0) {
    throw "Nenhum Android autorizado encontrado em 'adb devices'."
}

if (-not $env:TIKTOK_SMOKE_DEVICE) {
    $UsbDevices = @(
        $ConnectedDevices |
        Where-Object {
            $_ -notmatch ":"
        }
    )

    if ($UsbDevices.Count -eq 1) {
        $env:TIKTOK_SMOKE_DEVICE = $UsbDevices[0]
    }
    elseif ($ConnectedDevices.Count -eq 1) {
        $env:TIKTOK_SMOKE_DEVICE = $ConnectedDevices[0]
    }
    else {
        throw "Mais de um Android conectado. Defina TIKTOK_SMOKE_DEVICE antes de executar."
    }
}

if (-not $env:TIKTOK_SMOKE_APPIUM_URL) {
    if ($env:APPIUM_URL) {
        $env:TIKTOK_SMOKE_APPIUM_URL = $env:APPIUM_URL
    }
    else {
        $env:TIKTOK_SMOKE_APPIUM_URL = "http://127.0.0.1:4723"
    }
}

if (-not $env:TIKTOK_SMOKE_USERNAME) {
    $env:TIKTOK_SMOKE_USERNAME = "tiktok"
}

Write-Host (
    "[PASS] Android selecionado: {0}" -f
    $env:TIKTOK_SMOKE_DEVICE
) -ForegroundColor Green

Write-Host (
    "[INFO] Appium: {0}" -f
    $env:TIKTOK_SMOKE_APPIUM_URL
)

Write-Host (
    "[INFO] Target read-only: @{0}" -f
    $env:TIKTOK_SMOKE_USERNAME
)

try {
    $StatusUrl = (
        $env:TIKTOK_SMOKE_APPIUM_URL.TrimEnd("/") +
        "/status"
    )

    $null = Invoke-RestMethod -Uri $StatusUrl -Method Get -TimeoutSec 5

    Write-Host "[PASS] Appium conectado." -ForegroundColor Green
}
catch {
    throw (
        "Appium nao respondeu em {0}. Inicie o Appium antes de rodar a validacao final. Erro: {1}" -f
        $env:TIKTOK_SMOKE_APPIUM_URL,
        $_.Exception.Message
    )
}

Invoke-FinalStep "1/8 BACKEND TYPECHECK" {
    pnpm exec tsc --noEmit --noUnusedLocals false --noUnusedParameters false
}

Invoke-FinalStep "2/8 ANDROID + CORE TESTS" {
    pnpm exec vitest run tests/tiktok/android-profile-navigation.test.ts tests/tiktok/android-relationship.test.ts tests/tiktok/android-follow-registration.test.ts tests/tiktok/mobile-agent-android-bridge.test.ts tests/tiktok/provider-control-service.test.ts tests/tiktok/register-follow-scheduling.test.ts tests/tiktok/follow-back-handler.test.ts tests/tiktok/persistence-follow-back-review.test.ts tests/tiktok/runtime-wiring.test.ts tests/tiktok/scheduler-follow-back-safety.test.ts tests/tiktok/automatic-queue-repository-safety.test.ts tests/tiktok/due-queue-query-safety.test.ts tests/tiktok/unfollow-repository-safety.test.ts tests/tiktok/manual-review-service.test.ts tests/tiktok/manual-review-transition-atomicity.test.ts
}

Invoke-FinalStep "3/8 DASHBOARD PRODUCTION BUILD" {
    pnpm --dir web build
}

Invoke-FinalStep "4/8 REAL ANDROID PROVIDER READ-ONLY" {
    pnpm exec tsx scripts/tiktok-android-live-provider-smoke.ts
}

Invoke-FinalStep "5/8 REAL DB READ-ONLY CORE" {
    pnpm exec tsx scripts/tiktok-core-observability-smoke.ts

    if ($LASTEXITCODE -ne 0) {
        return
    }

    pnpm exec tsx scripts/tiktok-android-runtime-db-smoke.ts
}

Invoke-FinalStep "6/8 DASHBOARD BACKEND API" {
    pnpm exec tsx scripts/tiktok-final-api-smoke.ts
}

Invoke-FinalStep "7/8 MOBILE-ONLY SOURCE GUARD" {
    $RuntimeSource = Get-Content -LiteralPath "src\tiktok\runtime.ts" -Raw
    $PanelSource = Get-Content -LiteralPath "web\src\pages\TikTokTab.tsx" -Raw

    if ($RuntimeSource -match "WebTikTokProvider") {
        throw "Runtime ainda referencia WebTikTokProvider."
    }

    if ($PanelSource -match "Cookie|Playwright|browserProvider|TikTok Web Local") {
        throw "Painel TikTok ainda contem controles Web/browser."
    }

    Write-Host "RUNTIME_DEFAULT_PROVIDER=android"
    Write-Host "TIKTOK_PANEL_MODE=android-only"
    Write-Host "PLAYWRIGHT_OPERATIONAL_PATH=disabled"
    Write-Host "BROWSER_OPENED=false"
}

Invoke-FinalStep "8/8 FINAL REPOSITORY CHECK" {
    git --no-pager diff --check

    if ($LASTEXITCODE -ne 0) {
        return
    }

    $UnexpectedFinal = @(
        git status --porcelain |
        Where-Object {
            $_ -notmatch "backups/phase13_atomic_creation_20260917_115951"
        }
    )

    if ($UnexpectedFinal.Count -gt 0) {
        $UnexpectedFinal
        throw "A validacao deixou alteracoes locais inesperadas."
    }

    git status --short
}

$Head = (git rev-parse --short HEAD).Trim()

Write-Host ""
Write-Host "============================================================" -ForegroundColor Green
Write-Host " TIKTOK ANDROID-ONLY FINAL VALIDATION = PASS"
Write-Host "============================================================" -ForegroundColor Green
Write-Host "HEAD=$Head"
Write-Host "BACKEND=PASS"
Write-Host "ANDROID_CORE_TESTS=PASS"
Write-Host "DASHBOARD_BUILD=PASS"
Write-Host "ANDROID_REAL_READ_ONLY=PASS"
Write-Host "CORE_DB_READ_ONLY=PASS"
Write-Host "RUNTIME_PROVIDER_SCOPE=android"
Write-Host "DASHBOARD_BACKEND_API=PASS"
Write-Host "TIKTOK_PANEL_MODE=android-only"
Write-Host "PLAYWRIGHT_OPERATIONAL_PATH=disabled"
Write-Host "BROWSER_OPENED=false"
Write-Host "SOCIAL_MUTATIONS_PERFORMED_BY_REAL_SMOKES=false"
Write-Host "TIKTOK_FINAL_VALIDATION=PASS"
Write-Host "============================================================" -ForegroundColor Green
