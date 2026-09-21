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
Write-Host " CLAWDAGENT TIKTOK - VALIDACAO FINAL"
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Esta e a unica bateria final."
Write-Host "Nenhum Follow, Unfollow, Like, Comment ou DM sera executado pelos smokes reais."
Write-Host "O ultimo passo abre o TikTok Web somente para leitura."
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

$AccountsFile = Join-Path $Repo "data\tiktok-accounts.json"

if (-not (Test-Path -LiteralPath $AccountsFile)) {
    throw "Arquivo de contas TikTok nao encontrado: $AccountsFile"
}

$Accounts = @(
    Get-Content -LiteralPath $AccountsFile -Raw |
    ConvertFrom-Json
)

if ($Accounts.Count -lt 1) {
    throw "Nenhuma conta TikTok Web cadastrada."
}

if (-not $env:TIKTOK_WEB_ACCOUNT_ID) {
    $SelectedAccount = @(
        $Accounts |
        Where-Object { $_.status -eq "active" }
    ) | Select-Object -First 1

    if (-not $SelectedAccount) {
        $SelectedAccount = $Accounts | Select-Object -First 1
    }

    $env:TIKTOK_WEB_ACCOUNT_ID = [string]$SelectedAccount.id
}

if (-not $env:TIKTOK_WEB_ACCOUNT_ID) {
    throw "Nao foi possivel resolver TIKTOK_WEB_ACCOUNT_ID."
}

if (-not $env:TIKTOK_WEB_PROVIDER_SMOKE_EXPECTED) {
    $env:TIKTOK_WEB_PROVIDER_SMOKE_EXPECTED = "known"
}

if (-not $env:TIKTOK_WEB_PROVIDER_SMOKE_USERNAME) {
    $env:TIKTOK_WEB_PROVIDER_SMOKE_USERNAME = "tiktok"
}

Write-Host (
    "[PASS] Conta Web selecionada: {0}" -f
    $env:TIKTOK_WEB_ACCOUNT_ID
) -ForegroundColor Green

Write-Host (
    "[INFO] Target read-only: @{0}" -f
    $env:TIKTOK_WEB_PROVIDER_SMOKE_USERNAME
)

Invoke-FinalStep "1/8 BACKEND TYPECHECK" {
    pnpm exec tsc --noEmit --noUnusedLocals false --noUnusedParameters false
}

Invoke-FinalStep "2/8 TIKTOK TEST SUITE" {
    pnpm exec vitest run tests/tiktok
}

Invoke-FinalStep "3/8 DASHBOARD PRODUCTION BUILD" {
    pnpm --dir web build
}

Invoke-FinalStep "4/8 WINDOWS DPAPI / COOKIE VAULT" {
    pnpm exec tsx scripts/tiktok-cookie-vault-migration-smoke.ts
}

Invoke-FinalStep "5/8 REAL DB READ-ONLY CORE" {
    pnpm exec tsx scripts/tiktok-core-observability-smoke.ts

    if ($LASTEXITCODE -ne 0) {
        return
    }

    pnpm exec tsx scripts/tiktok-web-runtime-db-smoke.ts
}

Invoke-FinalStep "6/8 DASHBOARD BACKEND API" {
    pnpm exec tsx scripts/tiktok-final-api-smoke.ts
}

Invoke-FinalStep "7/8 REAL WEB PROVIDER READ-ONLY" {
    Write-Host ""
    Write-Host "Uma janela mobile do TikTok sera aberta." -ForegroundColor Yellow
    Write-Host "Se houver puzzle/CAPTCHA, resolva manualmente na propria janela." -ForegroundColor Yellow
    Write-Host "O script NAO resolve nem contorna CAPTCHA automaticamente." -ForegroundColor Yellow
    Write-Host ""

    pnpm exec tsx scripts/tiktok-web-provider-smoke.ts
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
Write-Host " TIKTOK FINAL VALIDATION = PASS"
Write-Host "============================================================" -ForegroundColor Green
Write-Host "HEAD=$Head"
Write-Host "BACKEND=PASS"
Write-Host "TIKTOK_TESTS=PASS"
Write-Host "DASHBOARD_BUILD=PASS"
Write-Host "COOKIE_VAULT_DPAPI=PASS"
Write-Host "CORE_DB_READ_ONLY=PASS"
Write-Host "RUNTIME_PROVIDER_SCOPE=PASS"
Write-Host "DASHBOARD_BACKEND_API=PASS"
Write-Host "WEB_PROVIDER_REAL_READ_ONLY=PASS"
Write-Host "MUTATIONS_PERFORMED_BY_REAL_SMOKES=false"
Write-Host "TIKTOK_FINAL_VALIDATION=PASS"
Write-Host "============================================================" -ForegroundColor Green
