param(
  [Parameter(Mandatory = $true)][string]$ContainerName,
  [Parameter(Mandatory = $true)][string]$DatabaseName,
  [ValidateRange(2, 20)][int]$Rounds = 5
)

$ErrorActionPreference = 'Stop'
if ($ContainerName -notlike 'codex_beta_equipment_sqlcert_*' -or $DatabaseName -notlike 'beta_equipment_cert_*') {
  throw 'This test accepts only a separately owned disposable beta Equipment certification database.'
}
$owner = & docker inspect --format '{{index .Config.Labels "codex.owner"}}' $ContainerName
if ($LASTEXITCODE -ne 0 -or $owner.Trim() -ne 'beta-equipment-sqlcert') { throw 'Disposable container ownership not verified.' }
$identity = & docker exec $ContainerName psql -U postgres -d $DatabaseName -At -v ON_ERROR_STOP=1 -c 'select current_database(),max(version) from cert.applied_migrations;'
if ($LASTEXITCODE -ne 0 -or $identity.Trim() -ne "$DatabaseName|20261011000300") { throw 'Database identity or target migration is not verified.' }

function Invoke-Sql([string]$sql) {
  $output = @(& docker exec $ContainerName psql -U postgres -d $DatabaseName -At -v ON_ERROR_STOP=1 -c $sql)
  if ($LASTEXITCODE -ne 0) { throw 'SQL command failed.' }
  return $output
}

$setup = @'
BEGIN;
INSERT INTO erp.companies(id,code,name,active,environment_class) VALUES('TENANT-EQP-DUAL-CONC','EDCC','Dual numbering concurrency',true,'test');
INSERT INTO auth.users(id) VALUES('98000000-0000-4000-8000-000000000001');
INSERT INTO erp.users(id,username,display_name,email,status,company_id)
 VALUES('98000000-0000-4000-8000-000000000001','dual.concurrent','Dual Concurrent','dual.concurrent@example.test','active','TENANT-EQP-DUAL-CONC');
INSERT INTO erp.user_roles(user_id,role_id)
 SELECT '98000000-0000-4000-8000-000000000001'::uuid,id FROM erp.app_roles WHERE code='system-administrator';
INSERT INTO erp.cost_codes(id,code,name,active) VALUES('COST-EQP-DUAL-CONC','EDCC','Dual concurrency',true);
INSERT INTO erp.equipment_subcategories(id,company_id,category_id,name,active)
 VALUES('98000000-0000-4000-8000-000000000010','TENANT-EQP-DUAL-CONC','d4c032dc-dc09-5a24-87c5-e663645f75ba','Dual concurrency',true);
CREATE FUNCTION erp.cert_delay_dual_equipment() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN IF NEW.company_id='TENANT-EQP-DUAL-CONC' THEN PERFORM pg_sleep(1); END IF; RETURN NEW; END $$;
CREATE TRIGGER cert_delay_dual_equipment BEFORE INSERT ON erp.equipment
 FOR EACH ROW EXECUTE FUNCTION erp.cert_delay_dual_equipment();
COMMIT;
'@
Invoke-Sql $setup | Out-Null
$script:ObservedOverlap = $false

function New-Command([string]$name, [string]$legacy = '') {
  $command = @{
    commandId = [guid]::NewGuid().ToString(); idempotencyKey = [guid]::NewGuid().ToString();
    equipmentId = [guid]::NewGuid().ToString(); equipmentName = $name;
    categoryId = 'd4c032dc-dc09-5a24-87c5-e663645f75ba';
    subcategoryId = '98000000-0000-4000-8000-000000000010';
    maintenanceType = 'Hour Meter'; costCodeId = 'COST-EQP-DUAL-CONC'
  }
  if ($legacy) { $command.legacyEquipmentNumber = $legacy }
  return $command
}

function Command-Sql([hashtable]$command) {
  $json = ($command | ConvertTo-Json -Compress).Replace("'", "''")
  return "SELECT set_config('request.jwt.claim.sub','98000000-0000-4000-8000-000000000001',false); SELECT jsonb_build_object('pid',pg_backend_pid(),'result',erp.command_create_equipment('$json'::jsonb));"
}

function Invoke-Pair([hashtable]$first, [hashtable]$second) {
  $jobScript = {
    param($container, $database, $sql)
    $output = @(& docker exec -e PGAPPNAME=beta_equipment_cert_call $container psql -U postgres -d $database -At -v ON_ERROR_STOP=1 -c $sql)
    if ($LASTEXITCODE -ne 0) { throw 'Concurrent SQL command failed.' }
    return ($output | Select-Object -Last 1)
  }
  $left = Start-Job -ScriptBlock $jobScript -ArgumentList $ContainerName,$DatabaseName,(Command-Sql $first)
  $right = Start-Job -ScriptBlock $jobScript -ArgumentList $ContainerName,$DatabaseName,(Command-Sql $second)
  try {
    for ($sample = 0; $sample -lt 20 -and -not $script:ObservedOverlap; $sample++) {
      $active = @(& docker exec $ContainerName psql -U postgres -d $DatabaseName -At -c "SELECT count(*) FROM pg_stat_activity WHERE datname=current_database() AND application_name='beta_equipment_cert_call' AND state='active';")
      if ($LASTEXITCODE -ne 0) { throw 'Could not verify concurrent backend activity.' }
      if ([int]($active | Select-Object -Last 1) -ge 2) { $script:ObservedOverlap = $true }
      if ($left.State -eq 'Completed' -and $right.State -eq 'Completed') { break }
      Start-Sleep -Milliseconds 100
    }
    Wait-Job -Job $left,$right | Out-Null
    if ($left.State -ne 'Completed' -or $right.State -ne 'Completed') { throw 'Concurrent session failed.' }
    $leftResult = (Receive-Job $left | Select-Object -Last 1) | ConvertFrom-Json
    $rightResult = (Receive-Job $right | Select-Object -Last 1) | ConvertFrom-Json
    if ($leftResult.pid -eq $rightResult.pid) { throw 'Sessions were not independent.' }
    return @($leftResult,$rightResult)
  } finally {
    Remove-Job -Job $left,$right -Force
  }
}

function Assert-Outcomes($pair, [string[]]$expected, [string]$label) {
  $actual = @($pair | ForEach-Object { if ($_.result.success) { $_.result.disposition } else { $_.result.code } } | Sort-Object)
  if (($actual -join '|') -ne (($expected | Sort-Object) -join '|')) {
    throw "$label outcomes: $($actual -join ', ')"
  }
}

for ($round = 1; $round -le $Rounds; $round++) {
  $two = Invoke-Pair (New-Command "Same category A $round") (New-Command "Same category B $round")
  Assert-Outcomes $two @('ACCEPTED','ACCEPTED') "same-category round $round"
  $assetNumbers = @($two | ForEach-Object { $_.result.value.assetNo })
  if ($assetNumbers[0] -eq $assetNumbers[1]) { throw "same-category round $round reused an Asset Number" }

  $legacy = "DUAL-CONC-$round"
  $conflict = Invoke-Pair (New-Command "Legacy A $round" $legacy) (New-Command "Legacy B $round" $legacy.ToLowerInvariant())
  Assert-Outcomes $conflict @('ACCEPTED','LEGACY_NUMBER_CONFLICT') "legacy-conflict round $round"

  $retry = New-Command "Idempotent $round"
  $before = [long](Invoke-Sql "SELECT next_number FROM erp.equipment_asset_sequences WHERE prefix_code='ME';" | Select-Object -Last 1)
  $idempotent = Invoke-Pair $retry $retry
  Assert-Outcomes $idempotent @('ACCEPTED','REPLAYED') "idempotent round $round"
  $after = [long](Invoke-Sql "SELECT next_number FROM erp.equipment_asset_sequences WHERE prefix_code='ME';" | Select-Object -Last 1)
  if ($after -ne ($before + 1)) { throw "idempotent round $round allocated $($after - $before) Asset Numbers" }
  Write-Output "ROUND_PASS $round"
}

$evidence = (Invoke-Sql "SELECT jsonb_build_object('equipment',count(*),'distinctAssets',count(DISTINCT lower(asset_no)),'legacyCount',count(legacy_equipment_number),'distinctLegacy',count(DISTINCT lower(legacy_equipment_number)),'audits',(SELECT count(*) FROM erp.audit_log WHERE company_id='TENANT-EQP-DUAL-CONC' AND action='EQUIPMENT_CREATED'),'commands',(SELECT count(*) FROM erp.operational_command_idempotency WHERE company_id='TENANT-EQP-DUAL-CONC' AND command_status='COMPLETED')) FROM erp.equipment WHERE company_id='TENANT-EQP-DUAL-CONC';" | Select-Object -Last 1) | ConvertFrom-Json
$expectedCount = 4 * $Rounds
if ($evidence.equipment -ne $expectedCount -or $evidence.distinctAssets -ne $expectedCount -or
    $evidence.legacyCount -ne $Rounds -or $evidence.distinctLegacy -ne $Rounds -or
    $evidence.audits -ne $expectedCount -or $evidence.commands -ne $expectedCount) {
  throw "Final cardinality mismatch: $($evidence | ConvertTo-Json -Compress)"
}
if (-not $script:ObservedOverlap) { throw 'No overlap of active database sessions was observed.' }
Write-Output "CONCURRENCY_PASS independentSessions=$($Rounds * 6) observedOverlap=true registrations=$expectedCount conflicts=$Rounds idempotentReplays=$Rounds"
