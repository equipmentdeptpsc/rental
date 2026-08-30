param([ValidateSet('Migration','Application')][string]$Kind)
. (Join-Path $PSScriptRoot 'common.ps1')
Set-Location $script:RepositoryRoot
Assert-UatTarget
$supabaseCli = Resolve-SupabaseCli
if ($Kind -eq 'Migration') {
  & (Join-Path $PSScriptRoot 'uat-preflight.ps1') -ExpectedPendingMigration $script:ExpectedMigration
} else {
  & (Join-Path $PSScriptRoot 'uat-preflight.ps1')
}
if ($LASTEXITCODE -ne 0) { throw 'UAT preflight failed.' }
if ($Kind -eq 'Migration') {
  Invoke-LoggedStep 'uat-migration-push' { & $supabaseCli db push --linked }
} else {
  Invoke-LoggedStep 'uat-application-deploy' { & (Join-Path $script:BinRoot 'wrangler.cmd') deploy --env uat }
}
git rev-parse HEAD | Set-Content (Join-Path $script:ReportRoot 'last-deployed-commit.txt')
Write-Host "RESULT PASS isolated-UAT $Kind deployment"
