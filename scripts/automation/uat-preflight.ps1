param(
  [Parameter(Mandatory)][ValidatePattern('^[0-9a-fA-F]{40}$')][string]$AuthorizedHead,
  [Parameter(Mandatory)][ValidatePattern('^\d{14}_[A-Za-z0-9_-]+\.sql$')][string]$AuthorizedMigration,
  [Parameter(Mandatory)][ValidatePattern('^[0-9a-fA-F]{64}$')][string]$AuthorizedMigrationSha,
  [Parameter(Mandatory)][ValidatePattern('^\d{14}$')][string]$ExpectedPreviousRemoteMigration
)
$repositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$actualHead = (git -C $repositoryRoot rev-parse HEAD).Trim()
if ($actualHead -ne $AuthorizedHead) { throw 'PINNED_SHA=FAIL' }
if ((git -C $repositoryRoot status --porcelain).Trim()) { throw 'WORKING_TREE=DIRTY' }
$migrationPath = Join-Path $repositoryRoot "supabase\migrations\$AuthorizedMigration"
if (-not (Test-Path -LiteralPath $migrationPath -PathType Leaf)) { throw 'AUTHORIZED_MIGRATION=ABSENT' }
$migrationSha = (Get-FileHash -LiteralPath $migrationPath -Algorithm SHA256).Hash
if ($migrationSha -ne $AuthorizedMigrationSha.ToUpperInvariant()) { throw 'MIGRATION_SHA=FAIL' }
$authorizedVersion = $AuthorizedMigration.Substring(0, 14)
Write-Host 'PINNED_SHA=PASS'
Write-Host 'MIGRATION_SHA=PASS'
. (Join-Path $PSScriptRoot 'common.ps1')
. (Join-Path $PSScriptRoot 'uat-migration-ledger.ps1')
Set-Location $script:RepositoryRoot
Assert-UatTarget -MigrationAuthorizationVerified
$supabaseCli = Resolve-SupabaseCli
$status = git status --short
$status | Set-Content (Join-Path $script:ReportRoot 'git-status.txt')
Invoke-LoggedStep 'supabase-migration-list' { & $supabaseCli migration list --linked --output json }
Invoke-LoggedStep 'supabase-push-dry-run' { & $supabaseCli db push --linked --dry-run }
$remote = Get-RemoteMigrationLedger (Get-Content (Join-Path $script:LogRoot 'supabase-migration-list.log') -Raw)
$local = Get-LocalMigrationLedger (Join-Path $script:RepositoryRoot 'supabase\migrations')
$dryRun = Get-Content (Join-Path $script:LogRoot 'supabase-push-dry-run.log') -Raw
$pending = Assert-UatMigrationLedger $local $remote (Get-DryRunPendingMigrationVersions $dryRun) @($authorizedVersion)
$latestRemote = if ($remote.Count) { ($remote | Sort-Object Version | Select-Object -Last 1).Version } else { 'NONE' }
if ($latestRemote -ne $ExpectedPreviousRemoteMigration) { throw 'PRE_LATEST_REMOTE=FAIL' }
if ($pending.Count -ne 1 -or $pending[0] -ne $authorizedVersion) { throw 'PENDING_MIGRATIONS=FAIL' }
Write-Host "PRE_LATEST_REMOTE=$latestRemote"
Write-Host "PENDING_MIGRATIONS=$authorizedVersion"
Write-Host 'REMOTE_ONLY_NONE=PASS'
Write-Host 'RESULT PASS UAT preflight'
