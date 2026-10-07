# UAT Migration Provenance Recovery

Date: 2026-10-04

## Scope and reason

This document records the controlled restoration of source representations for
migrations present in the UAT remote migration ledger but absent from the
canonical web repository. The restoration is provenance-only: no migration was
replayed, repaired, applied, deployed, or used to change UAT or production.

Before restoration, the linked UAT ledger contained 342 versions and the
canonical repository tracked 288 migration files. The 54 remote-only versions
were reconciled as 49 A-class exact historical recoveries and five B-class
strong historical reconstructions.

## Provenance classes

- **A-class:** exact historical source bytes recovered and hash-verified.
- **B-class:** historically anchored source bytes recovered with strong
  independent provenance, but without claiming that the bytes were preserved in
  the original committed Git history.

## A-class restoration

The 49 A-class files were restored from the certified migration sync snapshot,
with their original filenames, SQL bytes, and line endings preserved. They are
grouped by release lineage as follows:

- 20260924–20260927: 18 files
- 20260928–20260930: 26 files
- 20261001–20261003: 5 files

## B-class restoration

The following five files were restored from the strongest available historical
artifacts:

| Version | SHA-256 | Provenance note |
| --- | --- | --- |
| `20260928001600` | `583D5DF461499736F8D20A59370DE2C730212337F6A28FC47312840776261516` | Historical DEUR worktree snapshot |
| `20260929000100` | `7D487BC3035E92D37888FAA556E9E44090CDBF70E991D4F833E3140563DE0DF0` | Historical DEUR worktree snapshot; preserved blank lines retained |
| `20260929000200` | `D9C9041C81586E49CA1FB45385BBA379974D6416E04EF279E9CF9F47C7A2BD29` | Historical DEUR worktree snapshot; preserved blank line retained |
| `20260929000300` | `FC3266C087F7453EA0ACD86EAC2A88C779343CC6801AB85826D1D84ABD197152` | Historical DEUR worktree snapshot |
| `20261004000400` | `7AC10A89C24D3ABE1A092A05634974531550102FAEBFC60515A34D5B9F8E0ED9` | Canonical source artifact with matching UAT function fingerprint |

The first four B-class files are strongly reconstructed historical artifacts
from the ordered DEUR diagnostic worktree sequence. They are not represented as
proven original Git-history bytes. In particular, later normalized temporary
copies of `20260929000100` and `20260929000200` were not used.

## Ledger boundaries

After restoration, canonical migration version IDs are expected to represent
all 342 applied UAT versions with no remote-only or tracked-but-remote-missing
IDs. Version `20261003000630` is intentionally excluded because it was not
remotely applied.

## Safety record

- No `db push` was executed.
- No migration repair was executed.
- No migration was replayed or applied.
- UAT was not modified.
- Production was untouched.
- Functional fixes and eDEUR work remain outside this restoration.
