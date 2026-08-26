# UAT backlog

| Item | State | Evidence / next action |
|---|---|---|
| Catalog 2.0 Users-list visibility | CLOSED | 00700 applied; four users and both Operations Managers visible with role embeds. |
| Duplicate Operations Manager | CLOSED | `645384d0-c872-4245-84b5-9ec16305431c` deactivated; original and both Auth identities preserved. |
| Rental Activate | CLOSED | RNT-2026-000001 activated; DEUR/commercial/Assignment/equipment invariants preserved. |
| Canonical remote Return | VERIFIED | Existing canonical `returnAll` command wired into remote quick actions; deployed control is visible and enabled. Return was not executed. |
| Remote Audit Trail projection | OPEN | UI shows zero events despite successful transactional trusted commands; diagnose after Return deployment. |
| Digital DEUR end-to-end | VERIFIED | DEUR-2026-000001 corrected audibly to `2026-08-26`, exercised through activity transitions, completed, and submitted exactly once. |
| Grouped customer acknowledgement | VERIFIED | One trusted grouped review was delivered through the isolated-UAT override and manually acknowledged; the canonical DEUR is Acknowledged at row version 9 with one consumed request and no duplicate outcome. |
| Post-acknowledgement workspace projection | IN PROGRESS | Canonical Acknowledged DEUR and Equipment are persisted; frontend remote workspace incorrectly sourced DEUR/Equipment from local compatibility repositories. Local fix is green and awaiting isolated-UAT deployment/certification. |
| Remote Operator commercial evidence | CLOSED | Operators remain unable to read financial snapshots; remote preparation now delegates immutable commercial binding to the canonical server command. |
| Remote DEUR event projection | CLOSED | `deur_events` are hydrated and ordered; the active view now shows Operation instead of offering a duplicate Start Operation. |
| UX/UI modernization | OPEN | Begin with Rental Workspace only after its workflow is green. |
