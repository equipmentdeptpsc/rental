select json_build_object(
  'canonical_helper_count', count(*) filter (where p.proname = 'canonical_deur_snapshot_text'),
  'fingerprint_helper_count', count(*) filter (where p.proname = 'current_deur_expectation_fingerprint'),
  'readiness_count', count(*) filter (where p.proname = 'rental_release_readiness' and pg_get_function_identity_arguments(p.oid) = 'target_rental_id text'),
  'start_count', count(*) filter (where p.proname = 'command_start_deur_shift' and pg_get_function_identity_arguments(p.oid) = 'command jsonb'),
  'readiness_mentions_fingerprint', bool_or(pg_get_functiondef(p.oid) like '%current_deur_expectation_fingerprint%') filter (where p.proname = 'rental_release_readiness'),
  'start_mentions_snapshot_required', bool_or(pg_get_functiondef(p.oid) like '%DEUR_EXPECTATION_REQUIRED%') filter (where p.proname = 'command_start_deur_shift'),
  'readiness_owner', max(pg_get_userbyid(p.proowner)) filter (where p.proname = 'rental_release_readiness'),
  'start_owner', max(pg_get_userbyid(p.proowner)) filter (where p.proname = 'command_start_deur_shift'),
  'readiness_authenticated_execute', bool_or(has_function_privilege('authenticated',p.oid,'EXECUTE')) filter (where p.proname = 'rental_release_readiness'),
  'start_authenticated_execute', bool_or(has_function_privilege('authenticated',p.oid,'EXECUTE')) filter (where p.proname = 'command_start_deur_shift')
) as rollback_audit
from pg_proc p
join pg_namespace n on n.oid=p.pronamespace
where n.nspname='erp'
  and p.proname in ('canonical_deur_snapshot_text','current_deur_expectation_fingerprint','rental_release_readiness','command_start_deur_shift');
