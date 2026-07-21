BEGIN;
CREATE TABLE erp.migration_rollback_probe(id integer PRIMARY KEY);
INSERT INTO erp.migration_rollback_probe(id) VALUES(1);
SELECT 1/0;
COMMIT;
