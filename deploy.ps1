param(
    [Parameter(Mandatory = $false)]
    [string]$RemoteUrl
)

$ErrorActionPreference = 'Stop'

function Write-Info {
    param([string]$Message)
    Write-Host "[deploy] $Message"
}

function Invoke-Git {
    param([Parameter(Mandatory = $true)][string[]]$Arguments)

    & git @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "git $($Arguments -join ' ') failed with exit code $LASTEXITCODE."
    }
}

function Test-GitCommandSucceeded {
    param([Parameter(Mandatory = $true)][scriptblock]$Command)

    # Run a Git command quietly and return whether it succeeded.
    & $Command 2>$null 1>$null
    return ($LASTEXITCODE -eq 0)
}

if ([string]::IsNullOrWhiteSpace($RemoteUrl)) {
    $RemoteUrl = Read-Host 'Enter the GitHub remote URL'
}

if ([string]::IsNullOrWhiteSpace($RemoteUrl)) {
    throw 'Remote URL is required.'
}

Write-Info 'Checking whether this folder is already a Git repository.'
$insideWorkTree = Test-GitCommandSucceeded { git rev-parse --is-inside-work-tree }
if (-not $insideWorkTree) {
    Write-Info 'No Git repository found. Initializing a new repository.'
    Invoke-Git -Arguments @('init')
}

Write-Info 'Ensuring the active branch is named main.'
Invoke-Git -Arguments @('branch', '-M', 'main')

Write-Info 'Adding all files to the index.'
Invoke-Git -Arguments @('add', '.')

# Only commit when git add produced staged changes.
$hasStagedChanges = -not (Test-GitCommandSucceeded { git diff --cached --quiet })
$hasExistingCommit = Test-GitCommandSucceeded { git rev-parse --verify HEAD }
$commitCreated = $false

if ($hasStagedChanges) {
    Write-Info 'Creating the first commit.'
    Invoke-Git -Arguments @('commit', '-m', 'Initial commit for SmartProto')
    $commitCreated = $true
} else {
    Write-Info 'No changes were staged, so the commit step is being skipped.'
}

# Keep origin aligned with the provided GitHub repository URL.
Write-Info 'Configuring the origin remote.'
$originExists = Test-GitCommandSucceeded { git remote get-url origin }
if ($originExists) {
    Write-Info 'Updating the existing origin URL.'
    Invoke-Git -Arguments @('remote', 'set-url', 'origin', $RemoteUrl)
} else {
    Write-Info 'Adding origin for the first time.'
    Invoke-Git -Arguments @('remote', 'add', 'origin', $RemoteUrl)
}

# Push only when there is a commit to publish.
if ($commitCreated -or $hasExistingCommit) {
    Write-Info 'Pushing main to origin and setting upstream tracking.'
    Invoke-Git -Arguments @('push', '-u', 'origin', 'main')
} else {
    Write-Info 'Skipping push because there is no commit yet to publish.'
}
