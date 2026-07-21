# Local Storage Export Manifest

`buildMigrationExportManifest` reads every repository through `PersistenceAdapter`. It never writes or removes storage values. The version-1 manifest records application/catalog versions, fixed export time, repository logical and physical names, source schema, dependency order, record count, source payload, warnings, completion status, and SHA-256 checksums.

Determinism requires callers to supply `exportedAt` and application version. Repository ordering follows the catalog. Object properties are sorted, arrays retain evidence order, timestamps with offsets normalize to UTC, finite numbers use ECMAScript canonical rendering, and present `undefined` values are distinguished from null. Missing repositories are complete zero-record sources; malformed envelopes and adapter errors are retained with warnings rather than discarded.

The export is retained offline, encrypted at rest by the migration operator, and never uploaded by application code. Immutable snapshots and billing statements are copied byte-semantically into the manifest payload and are not recalculated.
