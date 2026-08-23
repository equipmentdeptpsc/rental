$ErrorActionPreference = "Stop"
$psql = "C:\Program Files\PostgreSQL\17\bin\psql.exe"
$connection = @("-h", "127.0.0.1", "-p", "55441", "-U", "postgres", "-d", "postgres", "-At", "-v", "ON_ERROR_STOP=1")
$env:PGPASSWORD = "postgres"

function Invoke-Sql([string]$sql) {
  $output = & $psql @connection -c $sql
  if ($LASTEXITCODE -ne 0) { throw "psql failed" }
  return @($output)
}

function Invoke-CommandPair([string]$left, [string]$right) {
  $jobScript = {
    param($executable, $arguments, $sql)
    $env:PGPASSWORD = "postgres"
    & $executable @arguments -c $sql
    if ($LASTEXITCODE -ne 0) { throw "concurrent psql failed" }
  }
  $first = Start-Job -ScriptBlock $jobScript -ArgumentList $psql, $connection, $left
  $second = Start-Job -ScriptBlock $jobScript -ArgumentList $psql, $connection, $right
  try {
    Wait-Job -Job $first, $second | Out-Null
    $firstOutput = @(Receive-Job $first)
    $secondOutput = @(Receive-Job $second)
    return @($firstOutput[-1], $secondOutput[-1])
  } finally { Remove-Job -Job $first, $second -Force }
}

function Command-Sql([hashtable]$command) {
  $json = $command | ConvertTo-Json -Compress
  $escaped = $json.Replace("'", "''")
  return "SELECT set_config('request.jwt.claim.sub','39000000-0000-4000-8000-000000000001',false); SELECT erp.command_create_equipment('$escaped'::jsonb);"
}

function Assert-ResultSet([object[]]$results, [string[]]$expected, [string]$label) {
  $actual = $results | ForEach-Object { ($_ | ConvertFrom-Json).disposition ?? ($_ | ConvertFrom-Json).code } | Sort-Object
  if (($actual -join "|") -ne (($expected | Sort-Object) -join "|")) { throw "$label returned $($actual -join ', ')" }
}

Invoke-Sql "DELETE FROM erp.audit_log WHERE company_id='TENANT-EQP-CONC'; DELETE FROM erp.operational_command_idempotency WHERE company_id='TENANT-EQP-CONC'; DELETE FROM erp.equipment WHERE company_id='TENANT-EQP-CONC'; DELETE FROM erp.user_roles WHERE user_id='39000000-0000-4000-8000-000000000001'; DELETE FROM erp.users WHERE id='39000000-0000-4000-8000-000000000001'; DELETE FROM auth.users WHERE id='39000000-0000-4000-8000-000000000001'; DELETE FROM erp.cost_codes WHERE id='COST-EQP-CONC'; DELETE FROM erp.companies WHERE id='TENANT-EQP-CONC'; INSERT INTO erp.companies(id,code,name,active,environment_class) VALUES('TENANT-EQP-CONC','EQPC','Equipment Concurrency',true,'test'); INSERT INTO auth.users(id) VALUES('39000000-0000-4000-8000-000000000001'); INSERT INTO erp.users(id,username,display_name,email,status,company_id) VALUES('39000000-0000-4000-8000-000000000001','eqp.concurrent','Equipment Concurrent','eqp.concurrent@example.test','active','TENANT-EQP-CONC'); INSERT INTO erp.user_roles(user_id,role_id) SELECT '39000000-0000-4000-8000-000000000001',id FROM erp.app_roles WHERE code='system-administrator'; INSERT INTO erp.cost_codes(id,code,name,active) VALUES('COST-EQP-CONC','EQPC','Equipment Concurrency',true); CREATE OR REPLACE FUNCTION erp.cert_delay_equipment() RETURNS trigger LANGUAGE plpgsql AS `$`$BEGIN IF NEW.company_id='TENANT-EQP-CONC' THEN PERFORM pg_sleep(0.20); END IF; RETURN NEW; END`$`$; DROP TRIGGER IF EXISTS cert_delay_equipment ON erp.equipment; CREATE TRIGGER cert_delay_equipment BEFORE INSERT ON erp.equipment FOR EACH ROW EXECUTE FUNCTION erp.cert_delay_equipment();" | Out-Null

for ($iteration = 1; $iteration -le 5; $iteration++) {
  $suffix = $iteration.ToString("00")
  $base = @{ maintenanceType = "Engine Hours"; costCodeId = "COST-EQP-CONC"; currentReading = 0 }

  $same = $base + @{ commandId = "same-$suffix"; idempotencyKey = "same-$suffix"; equipmentId = "39100000-0000-4000-8000-0000000000$suffix"; assetNo = "CONC-SAME-$suffix"; equipmentName = "Same $suffix" }
  Assert-ResultSet (Invoke-CommandPair (Command-Sql $same) (Command-Sql $same)) @("ACCEPTED", "REPLAYED") "identical idempotency"

  $mismatchA = $base + @{ commandId = "mismatch-a-$suffix"; idempotencyKey = "mismatch-$suffix"; equipmentId = "39200000-0000-4000-8000-0000000000$suffix"; assetNo = "CONC-MM-A-$suffix"; equipmentName = "Mismatch A $suffix" }
  $mismatchB = $base + @{ commandId = "mismatch-b-$suffix"; idempotencyKey = "mismatch-$suffix"; equipmentId = "39300000-0000-4000-8000-0000000000$suffix"; assetNo = "CONC-MM-B-$suffix"; equipmentName = "Mismatch B $suffix" }
  Assert-ResultSet (Invoke-CommandPair (Command-Sql $mismatchA) (Command-Sql $mismatchB)) @("ACCEPTED", "IDEMPOTENCY_MISMATCH") "mismatched idempotency"

  $idA = $base + @{ commandId = "id-a-$suffix"; idempotencyKey = "id-a-$suffix"; equipmentId = "39400000-0000-4000-8000-0000000000$suffix"; assetNo = "CONC-ID-A-$suffix"; equipmentName = "ID A $suffix" }
  $idB = $base + @{ commandId = "id-b-$suffix"; idempotencyKey = "id-b-$suffix"; equipmentId = $idA.equipmentId; assetNo = "CONC-ID-B-$suffix"; equipmentName = "ID B $suffix" }
  Assert-ResultSet (Invoke-CommandPair (Command-Sql $idA) (Command-Sql $idB)) @("ACCEPTED", "EQUIPMENT_ID_CONFLICT") "equipment identity"

  $assetA = $base + @{ commandId = "asset-a-$suffix"; idempotencyKey = "asset-a-$suffix"; equipmentId = "39500000-0000-4000-8000-0000000000$suffix"; assetNo = "CONC-ASSET-$suffix"; equipmentName = "Asset A $suffix" }
  $assetB = $base + @{ commandId = "asset-b-$suffix"; idempotencyKey = "asset-b-$suffix"; equipmentId = "39600000-0000-4000-8000-0000000000$suffix"; assetNo = "conc-asset-$suffix"; equipmentName = "Asset B $suffix" }
  Assert-ResultSet (Invoke-CommandPair (Command-Sql $assetA) (Command-Sql $assetB)) @("ACCEPTED", "ASSET_NUMBER_CONFLICT") "normalized asset number"
}

$evidenceJson = [string](Invoke-Sql "SELECT jsonb_build_object('equipment',count(*),'audits',(SELECT count(*) FROM erp.audit_log WHERE company_id='TENANT-EQP-CONC' AND action='EQUIPMENT_CREATED'),'commands',(SELECT count(*) FROM erp.operational_command_idempotency WHERE company_id='TENANT-EQP-CONC' AND command_status='COMPLETED')) FROM erp.equipment WHERE company_id='TENANT-EQP-CONC';" | Select-Object -Last 1)
$evidence = $evidenceJson | ConvertFrom-Json
if ($evidence.equipment -ne 20 -or $evidence.audits -ne 20 -or $evidence.commands -ne 20) { throw "cardinality mismatch: $($evidence | ConvertTo-Json -Compress)" }
Invoke-Sql "DROP TRIGGER cert_delay_equipment ON erp.equipment; DROP FUNCTION erp.cert_delay_equipment();" | Out-Null
Write-Output "CANONICAL_EQUIPMENT_DATABASE_CONCURRENCY_CERTIFICATION_PASS"
Write-Output ($evidence | ConvertTo-Json -Compress)
