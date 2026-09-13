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

function ConvertTo-MigrationLedger([object[]]$Rows, [string]$Source, [switch]$AllowMissingName) {
  $ledger = @($Rows | ForEach-Object {
    $version = [string]$_.version
    $name = [string]$_.name
    if ($version -notmatch '^\d{14}$' -or (-not $AllowMissingName -and [string]::IsNullOrWhiteSpace($name))) { throw "Invalid $Source migration ledger row." }
    [pscustomobject]@{ Version = $version; Name = $name; FileName = "${version}_${name}.sql" }
  })
  $duplicates = @($ledger | Group-Object Version | Where-Object Count -gt 1)
  if ($duplicates.Count) { throw "Duplicate $Source migration versions: $($duplicates.Name -join ', ')." }
  return $ledger
}

function Get-RemoteMigrationLedger([string]$MigrationListLog) {
  $trimmed = $MigrationListLog.Trim()
  if ($trimmed.StartsWith('[') -or $trimmed.StartsWith('{')) {
    try { $document = $trimmed | ConvertFrom-Json -ErrorAction Stop } catch { throw 'Unable to parse the Supabase migration ledger JSON.' }
    $rows = if ($document -is [array]) { $document } elseif ($document.migrations -is [array]) { $document.migrations } else { throw 'Supabase migration ledger JSON has no migrations array.' }
    return ConvertTo-MigrationLedger $rows 'remote'
  }
  $rows = @()
  $sawHeader = $false
  foreach ($line in ($MigrationListLog -split "`r?`n")) {
    if ($line -match '^\s*Local\s+\|\s+Remote\s+\|\s+Time') { $sawHeader = $true; continue }
    if (-not $sawHeader -or [string]::IsNullOrWhiteSpace($line) -or $line -match '^\s*-+\s*\|') { continue }
    if ($line -match '^\s*`(?<local>[^`]*)`\s*\|\s*`(?<remote>[^`]*)`\s*\|') {
      $local = $Matches.local.Trim(); $remote = $Matches.remote.Trim()
      if ($local -and $local -notmatch '^\d{14}$') { throw "Invalid remote migration table local version: $local." }
      if ($remote -and $remote -notmatch '^\d{14}$') { throw "Invalid remote migration table remote version: $remote." }
      if ($remote) { $rows += [pscustomobject]@{ version = $remote; name = $null } }
      continue
    }
    if ($line -match '\|') { throw "Malformed Supabase migration table row: $line" }
  }
  if (-not $sawHeader -or -not $rows.Count) { throw 'Supabase migration ledger output contained no parseable migration table.' }
  return ConvertTo-MigrationLedger $rows 'remote' -AllowMissingName
}

function Get-DryRunPendingMigrationVersions([string]$DryRunLog) {
  $jsonMatch = [regex]::Match($DryRunLog, '(?s)(\{\s*"upToDate".*\})\s*$')
  if ($jsonMatch.Success) {
    try { $document = $jsonMatch.Groups[1].Value | ConvertFrom-Json -ErrorAction Stop } catch { throw 'Unable to parse the Supabase dry-run JSON summary.' }
    if ($document.PSObject.Properties.Name -contains 'migrations') {
      $migrations = @($document.migrations)
      return @($migrations | ForEach-Object {
        if ([string]$_ -notmatch '^(?<version>\d{14})_[A-Za-z0-9_-]+\.sql$') { throw "Invalid dry-run migration filename: $_." }
        $Matches.version
      })
    }
  }
  if ($DryRunLog -match '(?im)(Remote database is up to date|No migrations (?:to apply|to be applied)|Database is up to date)') { return @() }
  $versions = @([regex]::Matches($DryRunLog, '(?m)^\s*[\u2022*-]\s+(\d{14})_[A-Za-z0-9_-]+\.sql\s*$') | ForEach-Object { $_.Groups[1].Value })
  if (-not $versions.Count) { throw 'Supabase dry-run output contained no parseable pending migrations.' }
  return $versions
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
    if ($remoteVersions[$index] -ne $localVersions[$index] -or ($remote[$index].Name -and $remote[$index].Name -ne $local[$index].Name)) {
      throw "Remote migration ledger diverges from the local forward-only prefix at position $index."
    }
  }
  $pendingVersions = @($localVersions | Select-Object -Skip $remote.Count)
  $dryVersions = @($DryRunPendingVersions | Where-Object { $_ })
  if ($dryVersions.Count -ne $pendingVersions.Count -or ($dryVersions.Count -gt 0 -and (Compare-Object $dryVersions $pendingVersions -SyncWindow 0))) {
    throw "Supabase dry-run pending migrations disagree with the local/remote ledger: expected $($pendingVersions -join ', '); received $($dryVersions -join ', ')."
  }
  $expectedVersions = @($ExpectedPendingVersions | ForEach-Object { [string]$_ -split ',' } | Where-Object { $_ })
  if ($expectedVersions.Count -ne $pendingVersions.Count -or ($expectedVersions.Count -gt 0 -and (Compare-Object $expectedVersions $pendingVersions -SyncWindow 0))) {
    throw "Expected pending migrations do not match the contiguous local suffix: expected $($expectedVersions -join ', '); found $($pendingVersions -join ', ')."
  }
  return $pendingVersions
}
