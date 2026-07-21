# Maintenance and Daily Log Migration Decision

Decision: normalize both modules (option A).

Maintenance records are operationally active in scheduling, equipment profiles, dashboards, detailed work-order pages, and reports. Daily Logs are created and edited in an active workflow and feed equipment profiles and dashboard services. Archival-only staging would prevent equivalent operation and reporting after a future cutover.

Migration `007_maintenance_daily_logs.sql` maps every current TypeScript field without changing application behavior. Both tables retain existing text IDs, reference Equipment (and for Daily Logs Operator and Project), use decimal-safe readings/hours, audit timestamps, soft-delete metadata, row versions, checks, and workflow indexes. Maintenance status remains `Scheduled`, `In Progress`, or `Completed`; completed records require a completion date. Daily Logs require nondecreasing readings and working hours from 0 through 24.

Local Storage remains authoritative. The migration adds only a future relational target.
