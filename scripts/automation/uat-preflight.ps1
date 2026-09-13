param([Alias('ExpectedPendingMigration')][string[]]$ExpectedPendingMigrations = @())
. (Join-Path $PSScriptRoot 'common.ps1')
. (Join-Path $PSScriptRoot 'uat-migration-ledger.ps1')
Set-Location $script:RepositoryRoot
Assert-UatTarget
$supabaseCli = Resolve-SupabaseCli
$status = git status --short
$status | Set-Content (Join-Path $script:ReportRoot 'git-status.txt')
Invoke-LoggedStep 'supabase-migration-list' { & $supabaseCli migration list --linked --output json }
Invoke-LoggedStep 'supabase-push-dry-run' { & $supabaseCli db push --linked --dry-run }
$remote = Get-RemoteMigrationLedger (Get-Content (Join-Path $script:LogRoot 'supabase-migration-list.log') -Raw)
$local = Get-LocalMigrationLedger (Join-Path $script:RepositoryRoot 'supabase\migrations')
$dryRun = Get-Content (Join-Path $script:LogRoot 'supabase-push-dry-run.log') -Raw
$pending = Assert-UatMigrationLedger $local $remote (Get-DryRunPendingMigrationVersions $dryRun) $ExpectedPendingMigrations
Write-Host "RESULT PASS UAT preflight; ordered pending migrations: $($pending -join ', ')"
