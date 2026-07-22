# Authentication Identity Mapping

`auth.users` is an authentication identity, not an Equipment Rental business entity. A future `erp.user_profiles` row should reference `auth.users.id` and retain display name, employment state, and application lifecycle metadata. Role assignments should reference the profile/user ID. Audit records retain an immutable actor ID and captured actor name even after a user is disabled or renamed.

An Operator is a business record. Operators may exist without login access, and users such as dispatchers, accountants, managers, or auditors may have no Operator record. An optional one-to-zero/one profile-to-Operator association can grant mobile/operator scope without conflating the identities.

Required states include active users, disabled users whose audit history remains readable, role changes recorded with effective dates/audit events, Operators without accounts, users without Operators, and explicit system/service actors for migrations and trusted scheduled operations. Service-role credentials must remain server-side and must never identify a human actor implicitly.
