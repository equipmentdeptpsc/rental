function Get-LocalMigrationLedger([string]$MigrationsPath) {
  $migrationFiles = @(Get-ChildItem -LiteralPath $MigrationsPath -Filter '*.sql' -File)
  $migrations = @($migrationFiles | ForEach-Object {
    if ($_.Name -notmatch '^(?<version>\d{14})_(?<name>[A-Za-z0-9_-]+)\.sql$') { throw "Invalid local migration filename: $($_.Name)." }
    [pscustomobject]@{ Version = $Matches.version; Name = $Matches.name; FileName = $_.Name }
  } | Sort-Object Version)
  $duplicates = @($migrations | Group-Object Version | Where-Object Count -gt 1)
  if ($duplicates.Count) { throw "Duplicate local migration versions: $($duplicates.Name -join ', ')." }
  return $migrations
}

function ConvertTo-MigrationLedger([object[]]$Rows, [string]$Source) {
  $ledger = @($Rows | ForEach-Object {
    $version = [string]$_.version
    $name = [string]$_.name
    if ($version -notmatch '^\d{14}$' -or [string]::IsNullOrWhiteSpace($name)) { throw "Invalid $Source migration ledger row." }
    [pscustomobject]@{ Version = $version; Name = $name; FileName = "${version}_${name}.sql" }
  })
  $duplicates = @($ledger | Group-Object Version | Where-Object Count -gt 1)
  if ($duplicates.Count) { throw "Duplicate $Source migration versions: $($duplicates.Name -join ', ')." }
  return $ledger
}

function Get-RemoteMigrationLedger([string]$MigrationListLog) {
  try { $document = $MigrationListLog | ConvertFrom-Json -ErrorAction Stop } catch { throw 'Unable to parse the Supabase migration ledger JSON.' }
  $rows = if ($document -is [array]) { $document } elseif ($document.migrations -is [array]) { $document.migrations } else { throw 'Supabase migration ledger JSON has no migrations array.' }
  return ConvertTo-MigrationLedger $rows 'remote'
}

function Get-DryRunPendingMigrationVersions([string]$DryRunLog) {
  return @([regex]::Matches($DryRunLog, '(?m)(\d{14})_[A-Za-z0-9_-]+\.sql') | ForEach-Object { $_.Groups[1].Value })
}

function Assert-UatMigrationLedger(
  [object[]]$LocalLedger,
  [object[]]$RemoteLedger,
  [string[]]$DryRunPendingVersions,
  [string[]]$ExpectedPendingVersions = @()
) {
  $local = @($LocalLedger)
  $remote = @($RemoteLedger)
  $localVersions = @($local | ForEach-Object Version)
  $remoteVersions = @($remote | ForEach-Object Version)
  if ($remote.Count -gt $local.Count) { throw 'Remote migration ledger is ahead of the local ledger.' }
  for ($index = 0; $index -lt $remote.Count; $index++) {
    if ($remoteVersions[$index] -ne $localVersions[$index] -or $remote[$index].Name -ne $local[$index].Name) {
      throw "Remote migration ledger diverges from the local forward-only prefix at position $index."
    }
  }
  $pendingVersions = @($localVersions | Select-Object -Skip $remote.Count)
  if (@($DryRunPendingVersions).Count -ne $pendingVersions.Count -or (Compare-Object $DryRunPendingVersions $pendingVersions -SyncWindow 0)) {
    throw "Supabase dry-run pending migrations disagree with the local/remote ledger: expected $($pendingVersions -join ', '); received $($DryRunPendingVersions -join ', ')."
  }
  if (@($ExpectedPendingVersions).Count -ne $pendingVersions.Count -or (Compare-Object $ExpectedPendingVersions $pendingVersions -SyncWindow 0)) {
    throw "Expected pending migrations do not match the contiguous local suffix: expected $($ExpectedPendingVersions -join ', '); found $($pendingVersions -join ', ')."
  }
  return $pendingVersions
}
