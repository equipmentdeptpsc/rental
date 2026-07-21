# Database Backup and Restore Rehearsal

The disposable `phase10c_a` database containing the valid synthetic fixture was backed up with PostgreSQL 17.10 custom format:

```powershell
pg_dump -h 127.0.0.1 -p 55432 -U postgres -d phase10c_a -Fc -f $BACKUP_PATH
createdb -h 127.0.0.1 -p 55432 -U postgres phase10c_restore
pg_restore -h 127.0.0.1 -p 55432 -U postgres -d phase10c_restore --exit-on-error $BACKUP_PATH
```

After restoration, catalog validation passed. Equipment, Rental, DEUR, and Billing Statement counts were each 1; the commercial snapshot hash remained `53c3153a72fe3c918a50e412270f5319b8787473a273cf5e271233783a39e0ea`; all reconciliation queries returned zero rows.

Credentials are supplied by environment or command context and must never be embedded in scripts. A future Supabase rehearsal must use provider backup/PITR facilities appropriate to the selected plan and separately verify a restore into an isolated project.
