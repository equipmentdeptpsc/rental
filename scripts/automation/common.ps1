$ErrorActionPreference = 'Stop'
$script:RepositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$script:AutomationRoot = Join-Path $script:RepositoryRoot '.artifacts\automation'
$script:LogRoot = Join-Path $script:AutomationRoot 'logs'
$script:ReportRoot = Join-Path $script:AutomationRoot 'reports'
$script:ScreenshotRoot = Join-Path $script:AutomationRoot 'screenshots'
$script:ExpectedBranch = 'uat-remediation-mvp-2026-08-21'
$script:ExpectedUatProjectRef = 'jtkctarqbwmqdcewthkn'
$script:BinRoot = Join-Path $script:RepositoryRoot 'node_modules\.bin'
New-Item -ItemType Directory -Force -Path $script:LogRoot,$script:ReportRoot,$script:ScreenshotRoot | Out-Null

function Resolve-SupabaseCli {
  $local = Join-Path $script:BinRoot 'supabase.cmd'
  if (Test-Path -LiteralPath $local) { return $local }
  $command = Get-Command supabase -ErrorAction SilentlyContinue
  if ($command) { return $command.Source }
  throw 'SUPABASE_CLI_NOT_FOUND'
}

function Invoke-LoggedStep([string]$Name,[scriptblock]$Action) {
  $log = Join-Path $script:LogRoot "$Name.log"
  try {
    $global:LASTEXITCODE = 0
    $previousPreference = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    & $Action *> $log
    $ErrorActionPreference = $previousPreference
    if ($LASTEXITCODE -ne 0) { throw "$Name exited with $LASTEXITCODE" }
    Write-Host "PASS $Name"
  } catch {
    $ErrorActionPreference = 'Stop'
    Write-Host "FAIL $Name ($log)"
    throw
  }
}

function Assert-UatTarget {
  $branch = (git -C $script:RepositoryRoot branch --show-current).Trim()
  if ($branch -ne $script:ExpectedBranch) { throw "Refusing UAT operation from branch $branch." }
  $refFile = Join-Path $script:RepositoryRoot 'supabase\.temp\project-ref'
  if (-not (Test-Path -LiteralPath $refFile)) { throw 'No linked Supabase project found.' }
  $projectRef = (Get-Content -LiteralPath $refFile -Raw).Trim()
  if ($projectRef -ne $script:ExpectedUatProjectRef) { throw "Refusing non-UAT Supabase project $projectRef." }
}
