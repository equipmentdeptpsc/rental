param([Parameter(Mandatory=$true)][string]$DatabaseUrl)
$ErrorActionPreference = 'Stop'
if (-not (Get-Command psql -ErrorAction SilentlyContinue)) { throw 'psql is required and was not found.' }
$root = Split-Path -Parent $PSScriptRoot
$files = @('001_foundation.sql','002_rental_deur.sql','003_billing_integration.sql','004_constraints_indexes_immutability.sql','005_seed_reference.sql','006_import_staging.sql')
foreach ($file in $files) { & psql $DatabaseUrl -v ON_ERROR_STOP=1 -f (Join-Path $root "database/postgresql/$file"); if ($LASTEXITCODE -ne 0) { throw "Migration failed: $file" } }
& psql $DatabaseUrl -v ON_ERROR_STOP=1 -f (Join-Path $root 'database/postgresql/validation/validate_catalog.sql')
if ($LASTEXITCODE -ne 0) { throw 'Catalog validation failed.' }
& psql $DatabaseUrl -v ON_ERROR_STOP=1 -f (Join-Path $root 'database/postgresql/validation/constraint_tests.sql')
if ($LASTEXITCODE -ne 0) { throw 'Constraint validation failed.' }
& psql $DatabaseUrl -v ON_ERROR_STOP=1 -f (Join-Path $root 'database/postgresql/validation/rollback_probe.sql')
if ($LASTEXITCODE -eq 0) { throw 'Rollback probe was expected to fail.' }
& psql $DatabaseUrl -v ON_ERROR_STOP=1 -c "DO `$`$ BEGIN IF to_regclass('erp.migration_rollback_probe') IS NOT NULL THEN RAISE EXCEPTION 'rollback probe left partial state'; END IF; END `$`$;"
if ($LASTEXITCODE -ne 0) { throw 'Rollback validation failed.' }
