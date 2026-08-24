$ErrorActionPreference = "Stop"
$psql = "C:\Program Files\PostgreSQL\17\bin\psql.exe"
$pgDump = "C:\Program Files\PostgreSQL\17\bin\pg_dump.exe"
$pgRestore = "C:\Program Files\PostgreSQL\17\bin\pg_restore.exe"
$port = if($env:SUPABASE_DB_PORT){$env:SUPABASE_DB_PORT}else{"54322"}
$certDatabase = "activity_code_cert_$PID"
$dumpFile = Join-Path ([IO.Path]::GetTempPath()) "$certDatabase.dump"
$adminConnection = @("-h", "127.0.0.1", "-p", $port, "-U", "postgres", "-d", "postgres", "-At", "-v", "ON_ERROR_STOP=1")
$connection = @("-h", "127.0.0.1", "-p", $port, "-U", "postgres", "-d", $certDatabase, "-At", "-v", "ON_ERROR_STOP=1")

function Invoke-Sql([string]$sql) { $output=& $psql @connection -c $sql; if($LASTEXITCODE -ne 0){throw "psql failed"}; return @($output) }
function Invoke-Pair([string]$left,[string]$right){
  $job={param($exe,$arguments,$sql) & $exe @arguments -c $sql; if($LASTEXITCODE -ne 0){throw "concurrent psql failed"}}
  $a=Start-Job -ScriptBlock $job -ArgumentList $psql,$connection,$left; $b=Start-Job -ScriptBlock $job -ArgumentList $psql,$connection,$right
  try{Wait-Job $a,$b|Out-Null; $ao=@(Receive-Job $a);$bo=@(Receive-Job $b);return @($ao[-1],$bo[-1])}finally{Remove-Job $a,$b -Force}
}
function Command([hashtable]$value){$json=($value|ConvertTo-Json -Compress).Replace("'","''");return "SELECT set_config('request.jwt.claim.sub','59000000-0000-4000-8000-000000000001',false);SELECT erp.command_create_activity_code('$json'::jsonb);"}
function Assert-Pair($results,[string[]]$expected,[string]$label){$actual=$results|ForEach-Object{$v=$_|ConvertFrom-Json;$v.disposition??$v.code}|Sort-Object;if(($actual-join '|') -ne (($expected|Sort-Object)-join '|')){throw "$label returned $($actual-join ',')"}}

try {
& $pgDump -h 127.0.0.1 -p $port -U postgres -d postgres -Fc --exclude-table-data=vault.secrets -f $dumpFile
if($LASTEXITCODE -ne 0){throw "pg_dump failed"}
& $psql @adminConnection -c "CREATE DATABASE $certDatabase;" | Out-Null
if($LASTEXITCODE -ne 0){throw "certification database creation failed"}
$restoreOutput=@(& $pgRestore -h 127.0.0.1 -p $port -U postgres -d $certDatabase --no-owner --no-privileges $dumpFile 2>&1)
if($LASTEXITCODE -ne 0){
  $restoreText=$restoreOutput-join"`n";$restoreErrorCount=([regex]::Matches($restoreText,'pg_restore: error:')).Count
  if($restoreErrorCount-ne1-or$restoreText-notmatch'permission denied to set parameter "log_min_messages"'-or$restoreText-notmatch'CREATE FUNCTION realtime\.list_changes'){throw "pg_restore failed outside the one known Supabase-owned function"}
}
if(([string](Invoke-Sql "SELECT to_regprocedure('erp.command_create_activity_code(jsonb)') IS NOT NULL;"|Select-Object -Last 1)).Trim()-ne't'){throw "Activity Code RPC missing from disposable database"}
Invoke-Sql "INSERT INTO erp.companies(id,code,name,active,environment_class) VALUES('TENANT-ACT-CONC','ACONC','Activity Concurrency',true,'test');INSERT INTO auth.users(id,email) VALUES('59000000-0000-4000-8000-000000000001','activity.concurrent@example.test');INSERT INTO erp.users(id,username,display_name,email,status,company_id) VALUES('59000000-0000-4000-8000-000000000001','activity.concurrent','Activity Concurrent','activity.concurrent@example.test','active','TENANT-ACT-CONC');INSERT INTO erp.user_roles(user_id,role_id) SELECT '59000000-0000-4000-8000-000000000001',id FROM erp.app_roles WHERE code='system-administrator';CREATE FUNCTION erp.cert_delay_activity_code() RETURNS trigger LANGUAGE plpgsql AS `$`$BEGIN IF NEW.code LIKE 'RACE-%' THEN PERFORM pg_sleep(0.15);END IF;RETURN NEW;END`$`$;CREATE TRIGGER cert_delay_activity_code BEFORE INSERT ON erp.activity_codes FOR EACH ROW EXECUTE FUNCTION erp.cert_delay_activity_code();"|Out-Null
for($i=1;$i -le 5;$i++){
 $s=$i.ToString('00')
 $same=@{commandId="same-$s";idempotencyKey="same-$s";activityCodeId="59100000-0000-4000-8000-0000000000$s";code="RACE-SAME-$s";name="Same $s"};Assert-Pair (Invoke-Pair (Command $same) (Command $same)) @('ACCEPTED','REPLAYED') 'identical'
 $ma=@{commandId="mm-a-$s";idempotencyKey="mm-$s";activityCodeId="59200000-0000-4000-8000-0000000000$s";code="RACE-MM-A-$s";name="Mismatch A"};$mb=@{commandId="mm-b-$s";idempotencyKey="mm-$s";activityCodeId="59300000-0000-4000-8000-0000000000$s";code="RACE-MM-B-$s";name="Mismatch B"};Assert-Pair (Invoke-Pair (Command $ma) (Command $mb)) @('ACCEPTED','IDEMPOTENCY_MISMATCH') 'mismatch'
 $ia=@{commandId="id-a-$s";idempotencyKey="id-a-$s";activityCodeId="59400000-0000-4000-8000-0000000000$s";code="RACE-ID-A-$s";name="ID A"};$ib=@{commandId="id-b-$s";idempotencyKey="id-b-$s";activityCodeId=$ia.activityCodeId;code="RACE-ID-B-$s";name="ID B"};Assert-Pair (Invoke-Pair (Command $ia) (Command $ib)) @('ACCEPTED','ACTIVITY_CODE_ID_CONFLICT') 'identity'
 $ca=@{commandId="code-a-$s";idempotencyKey="code-a-$s";activityCodeId="59500000-0000-4000-8000-0000000000$s";code="RACE-CODE-$s";name="Code A"};$cb=@{commandId="code-b-$s";idempotencyKey="code-b-$s";activityCodeId="59600000-0000-4000-8000-0000000000$s";code="race-code-$s";name="Code B"};Assert-Pair (Invoke-Pair (Command $ca) (Command $cb)) @('ACCEPTED','ACTIVITY_CODE_CONFLICT') 'normalized code'
}
$evidence=([string](Invoke-Sql "SELECT jsonb_build_object('activityCodes',(SELECT count(*) FROM erp.activity_codes WHERE code ILIKE 'RACE-%'),'audits',(SELECT count(*) FROM erp.audit_log WHERE company_id='TENANT-ACT-CONC' AND action='ACTIVITY_CODE_CREATED'),'commands',(SELECT count(*) FROM erp.operational_command_idempotency WHERE company_id='TENANT-ACT-CONC' AND command_type='CREATE_ACTIVITY_CODE' AND command_status='COMPLETED'));"|Select-Object -Last 1))|ConvertFrom-Json
if($evidence.activityCodes-ne 20-or $evidence.audits-ne 20-or $evidence.commands-ne 20){throw "cardinality mismatch $($evidence|ConvertTo-Json -Compress)"}
"CANONICAL_ACTIVITY_CODE_DATABASE_CONCURRENCY_CERTIFICATION_PASS";$evidence|ConvertTo-Json -Compress
} finally {
  & $psql @adminConnection -c "DROP DATABASE IF EXISTS $certDatabase WITH (FORCE);" | Out-Null
  Remove-Item -LiteralPath $dumpFile -Force -ErrorAction SilentlyContinue
}
