$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$container = 'codex-guarded-preflight-42702'
$image = 'postgres:17-alpine'

function Invoke-PsqlFile([string]$path) {
  Get-Content -Raw -LiteralPath $path | docker exec -i $container psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres
  if ($LASTEXITCODE -ne 0) { throw "psql failed for $path" }
}

try {
  docker run --name $container --detach --env POSTGRES_PASSWORD=postgres $image | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'Failed to create disposable PostgreSQL container.' }
  $ready = $false
  foreach ($attempt in 1..30) {
    docker exec $container pg_isready -U postgres -d postgres | Out-Null
    if ($LASTEXITCODE -eq 0) { $ready = $true; break }
    Start-Sleep -Milliseconds 500
  }
  if (-not $ready) { throw 'Disposable PostgreSQL container did not become ready.' }

  Invoke-PsqlFile (Join-Path $root 'tests\support\guardedProjectReviewPreflight42702Setup.sql')
  Invoke-PsqlFile (Join-Path $root 'supabase\migrations\20261014000300_guarded_project_review_first_delivery_preflight.sql')
  Invoke-PsqlFile (Join-Path $root 'tests\support\guardedProjectReviewPreflight42702Reproduction.sql')
  Invoke-PsqlFile (Join-Path $root 'supabase\migrations\20261014000400_guarded_project_review_first_delivery_preflight_ambiguous_id.sql')
  Invoke-PsqlFile (Join-Path $root 'tests\support\guardedProjectReviewPreflight42702Assertions.sql')
} finally {
  docker rm --force $container 2>$null | Out-Null
}
