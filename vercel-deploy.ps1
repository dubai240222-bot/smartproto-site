<#
Quick start:
1. Make sure you're signed in to Vercel CLI. If not, the script will open the browser for login.
2. Run: .\vercel-deploy.ps1
3. When it finishes, it will print the URL of the deployed app.
#>

$ErrorActionPreference = 'Stop'

function Write-Stage {
    param([Parameter(Mandatory = $true)][string]$Message)
    Write-Host "[vercel-deploy] $Message"
}

function Assert-NpxAvailable {
    Write-Stage 'Checking whether npx is available.'

    if (-not (Get-Command npx -ErrorAction SilentlyContinue)) {
        throw 'npx was not found. Please install Node.js/npm first, then run the script again.'
    }

    & npx --yes vercel --version 1>$null
    if ($LASTEXITCODE -ne 0) {
        throw 'Vercel CLI could not be started through npx. Please check your Node.js/npm setup and network access, then try again.'
    }
}

try {
    Assert-NpxAvailable

    Write-Host 'Если это первый запуск, Vercel попросит авторизоваться в браузере. Пожалуйста, разреши вход.'

    Write-Stage 'Linking the local project to Vercel.'
    & npx vercel link --yes
    if ($LASTEXITCODE -ne 0) {
        throw 'npx vercel link --yes failed with exit code ' + $LASTEXITCODE + '.'
    }

    Write-Stage 'Starting production deployment.'
    & npx vercel --prod --yes
    if ($LASTEXITCODE -ne 0) {
        throw 'npx vercel --prod --yes failed with exit code ' + $LASTEXITCODE + '.'
    }

    Write-Stage 'Deployment finished successfully.'
}
catch {
    Write-Host ''
    Write-Host '[vercel-deploy] Deployment failed.' -ForegroundColor Red
    Write-Host "[vercel-deploy] $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}
