param([switch]$Check)
$ErrorActionPreference = 'Stop'
$repositoryRoot = Split-Path -Parent $PSScriptRoot
$canonicalDirectory = Join-Path $repositoryRoot 'database/postgresql'
$generatedDirectory = Join-Path $repositoryRoot 'supabase/migrations'
$mapping = [ordered]@{
  '001_foundation.sql' = '20260722000100_foundation.sql'
  '002_rental_deur.sql' = '20260722000200_rental_deur.sql'
  '003_billing_integration.sql' = '20260722000300_billing_integration.sql'
  '004_constraints_indexes_immutability.sql' = '20260722000400_constraints_indexes_immutability.sql'
  '005_seed_reference.sql' = '20260722000500_seed_reference.sql'
  '006_import_staging.sql' = '20260722000600_import_staging.sql'
  '007_maintenance_daily_logs.sql' = '20260722000700_maintenance_daily_logs.sql'
  '008_equipment_status_read_policy.sql' = '20260722000800_equipment_status_read_policy.sql'
  '009_expose_erp_data_api_schema.sql' = '20260722000900_expose_erp_data_api_schema.sql'
  '010_reload_postgrest_schema.sql' = '20260722001000_reload_postgrest_schema.sql'
}
if (-not $Check) { New-Item -ItemType Directory -Path $generatedDirectory -Force | Out-Null }
$expectedNames = [System.Collections.Generic.HashSet[string]]::new([string[]]$mapping.Values)
if (Test-Path $generatedDirectory) {
  $unexpected = Get-ChildItem $generatedDirectory -Filter '*.sql' | Where-Object { -not $expectedNames.Contains($_.Name) }
  if ($unexpected) { throw "Unexpected generated migration(s): $($unexpected.Name -join ', ')" }
}
foreach ($entry in $mapping.GetEnumerator()) {
  $source = Join-Path $canonicalDirectory $entry.Key
  $destination = Join-Path $generatedDirectory $entry.Value
  if (-not (Test-Path $source)) { throw "Canonical migration missing: $source" }
  if (-not $Check) { Copy-Item -LiteralPath $source -Destination $destination -Force }
  if (-not (Test-Path $destination)) { throw "Generated migration missing: $destination" }
  $sourceHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $source).Hash
  $destinationHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $destination).Hash
  if ($sourceHash -ne $destinationHash) { throw "Checksum mismatch: $($entry.Key) -> $($entry.Value)" }
  Write-Output "$($entry.Key) -> $($entry.Value) SHA256=$sourceHash"
}
