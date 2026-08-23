$ErrorActionPreference = "Stop"
$psql = "C:\Program Files\PostgreSQL\17\bin\psql.exe"
$connection = @("-h", "127.0.0.1", "-p", "55442", "-U", "postgres", "-d", "postgres", "-At", "-v", "ON_ERROR_STOP=1")

function Invoke-Sql([string]$sql) { $output=& $psql @connection -c $sql; if($LASTEXITCODE -ne 0){throw "psql failed"}; return @($output) }
function Invoke-Pair([string]$left,[string]$right){
  $job={param($exe,$arguments,$sql) & $exe @arguments -c $sql; if($LASTEXITCODE -ne 0){throw "concurrent psql failed"}}
  $a=Start-Job -ScriptBlock $job -ArgumentList $psql,$connection,$left; $b=Start-Job -ScriptBlock $job -ArgumentList $psql,$connection,$right
  try{Wait-Job $a,$b|Out-Null; $ao=@(Receive-Job $a);$bo=@(Receive-Job $b);return @($ao[-1],$bo[-1])}finally{Remove-Job $a,$b -Force}
}
function Command([hashtable]$value){$json=($value|ConvertTo-Json -Compress).Replace("'","''");return "SELECT set_config('request.jwt.claim.sub','49000000-0000-4000-8000-000000000001',false);SELECT erp.command_create_cost_code('$json'::jsonb);"}
function Assert-Pair($results,[string[]]$expected,[string]$label){$actual=$results|ForEach-Object{$v=$_|ConvertFrom-Json;$v.disposition??$v.code}|Sort-Object;if(($actual-join '|') -ne (($expected|Sort-Object)-join '|')){throw "$label returned $($actual-join ',')"}}

Invoke-Sql "INSERT INTO erp.companies(id,code,name,active,environment_class) VALUES('TENANT-COST-CONC','CCONC','Cost Concurrency',true,'test');INSERT INTO auth.users(id,email) VALUES('49000000-0000-4000-8000-000000000001','cost.concurrent@example.test');INSERT INTO erp.users(id,username,display_name,email,status,company_id) VALUES('49000000-0000-4000-8000-000000000001','cost.concurrent','Cost Concurrent','cost.concurrent@example.test','active','TENANT-COST-CONC');INSERT INTO erp.user_roles(user_id,role_id) SELECT '49000000-0000-4000-8000-000000000001',id FROM erp.app_roles WHERE code='system-administrator';CREATE FUNCTION erp.cert_delay_cost_code() RETURNS trigger LANGUAGE plpgsql AS `$`$BEGIN IF NEW.code LIKE 'RACE-%' THEN PERFORM pg_sleep(0.15);END IF;RETURN NEW;END`$`$;CREATE TRIGGER cert_delay_cost_code BEFORE INSERT ON erp.cost_codes FOR EACH ROW EXECUTE FUNCTION erp.cert_delay_cost_code();"|Out-Null
for($i=1;$i -le 5;$i++){
 $s=$i.ToString('00')
 $same=@{commandId="same-$s";idempotencyKey="same-$s";costCodeId="49100000-0000-4000-8000-0000000000$s";code="RACE-SAME-$s";name="Same $s"};Assert-Pair (Invoke-Pair (Command $same) (Command $same)) @('ACCEPTED','REPLAYED') 'identical'
 $ma=@{commandId="mm-a-$s";idempotencyKey="mm-$s";costCodeId="49200000-0000-4000-8000-0000000000$s";code="RACE-MM-A-$s";name="Mismatch A"};$mb=@{commandId="mm-b-$s";idempotencyKey="mm-$s";costCodeId="49300000-0000-4000-8000-0000000000$s";code="RACE-MM-B-$s";name="Mismatch B"};Assert-Pair (Invoke-Pair (Command $ma) (Command $mb)) @('ACCEPTED','IDEMPOTENCY_MISMATCH') 'mismatch'
 $ia=@{commandId="id-a-$s";idempotencyKey="id-a-$s";costCodeId="49400000-0000-4000-8000-0000000000$s";code="RACE-ID-A-$s";name="ID A"};$ib=@{commandId="id-b-$s";idempotencyKey="id-b-$s";costCodeId=$ia.costCodeId;code="RACE-ID-B-$s";name="ID B"};Assert-Pair (Invoke-Pair (Command $ia) (Command $ib)) @('ACCEPTED','COST_CODE_ID_CONFLICT') 'identity'
 $ca=@{commandId="code-a-$s";idempotencyKey="code-a-$s";costCodeId="49500000-0000-4000-8000-0000000000$s";code="RACE-CODE-$s";name="Code A"};$cb=@{commandId="code-b-$s";idempotencyKey="code-b-$s";costCodeId="49600000-0000-4000-8000-0000000000$s";code="race-code-$s";name="Code B"};Assert-Pair (Invoke-Pair (Command $ca) (Command $cb)) @('ACCEPTED','COST_CODE_CONFLICT') 'normalized code'
}
$evidence=([string](Invoke-Sql "SELECT jsonb_build_object('costCodes',(SELECT count(*) FROM erp.cost_codes WHERE code ILIKE 'RACE-%'),'audits',(SELECT count(*) FROM erp.audit_log WHERE company_id='TENANT-COST-CONC' AND action='COST_CODE_CREATED'),'commands',(SELECT count(*) FROM erp.operational_command_idempotency WHERE company_id='TENANT-COST-CONC' AND command_type='CREATE_COST_CODE' AND command_status='COMPLETED'));"|Select-Object -Last 1))|ConvertFrom-Json
if($evidence.costCodes-ne 20-or $evidence.audits-ne 20-or $evidence.commands-ne 20){throw "cardinality mismatch $($evidence|ConvertTo-Json -Compress)"}
Invoke-Sql "DROP TRIGGER cert_delay_cost_code ON erp.cost_codes;DROP FUNCTION erp.cert_delay_cost_code();"|Out-Null
"CANONICAL_COST_CODE_DATABASE_CONCURRENCY_CERTIFICATION_PASS";$evidence|ConvertTo-Json -Compress
