# Local authentication persistence

The local repositories use versioned keys:

- `equipment-rental.auth.v1.users`
- `equipment-rental.auth.v1.session`

They intentionally do not read, rewrite, or remove the legacy `auth_user` and
`auth_token` keys. Recognized unversioned data stored under the new keys is
migrated into version 1 envelopes. Invalid or corrupt values are left untouched
and treated as unavailable.

Local passwords are stored as plain text for development and UAT only. This
adapter is not a production security boundary and does not provide password
hashing, password recovery, email verification, JWTs, OAuth, or remote identity
provider integration.
