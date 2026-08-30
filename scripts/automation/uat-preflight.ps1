param([string]$ExpectedPendingMigration = '')
. (Join-Path $PSScriptRoot 'common.ps1')
Set-Location $script:RepositoryRoot
Assert-UatTarget
$supabaseCli = Resolve-SupabaseCli
$status = git status --short
$status | Set-Content (Join-Path $script:ReportRoot 'git-status.txt')
Invoke-LoggedStep 'supabase-migration-list' { & $supabaseCli migration list --linked }
Invoke-LoggedStep 'supabase-push-dry-run' { & $supabaseCli db push --linked --dry-run }
$dryRun = Get-Content (Join-Path $script:LogRoot 'supabase-push-dry-run.log') -Raw
$pending = @([regex]::Matches($dryRun,'(?m)(\d{14})_[A-Za-z0-9_-]+\.sql') | ForEach-Object { $_.Groups[1].Value } | Sort-Object -Unique)
if ($ExpectedPendingMigration) {
  if ($pending.Count -ne 1 -or $pending[0] -ne $ExpectedPendingMigration) {
    throw "Expected only $ExpectedPendingMigration pending; found: $($pending -join ', ')."
  }
  Write-Host "RESULT PASS UAT preflight; sole pending migration $($pending[0])"
} elseif ($pending.Count -ne 0) {
  throw "Expected no pending migrations; found: $($pending -join ', ')."
} else {
  Write-Host 'RESULT PASS UAT preflight; remote migration ledger is up to date'
}
