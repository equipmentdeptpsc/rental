select json_build_object(
  'functions',json_agg(json_build_object(
    'name',p.proname,
    'owner',pg_get_userbyid(p.proowner),
    'security_definer',p.prosecdef,
    'search_path',p.proconfig,
    'public_execute',has_function_privilege('public',p.oid,'execute'),
    'anon_execute',has_function_privilege('anon',p.oid,'execute'),
    'authenticated_execute',has_function_privilege('authenticated',p.oid,'execute')
  ) order by p.proname),
  'command_uses_controlling_reason',position('controllingReasonCode' in pg_get_functiondef(
    'erp.command_normalize_legacy_rental_deur_expectations(jsonb)'::regprocedure
  ))>0,
  'wrapper_orders_reasons',position('order_legacy_normalization_reason_codes' in pg_get_functiondef(
    'erp.legacy_rental_normalization_eligibility(text)'::regprocedure
  ))>0
) as function_audit
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='erp' and p.proname in(
  'legacy_rental_normalization_eligibility_04200',
  'order_legacy_normalization_reason_codes',
  'legacy_rental_normalization_eligibility',
  'command_normalize_legacy_rental_deur_expectations'
);

select json_build_object(
 'customer',erp.order_legacy_normalization_reason_codes('["SUBMITTED_DEUR_EXISTS","CUSTOMER_REVIEW_EXISTS"]'),
 'manager',erp.order_legacy_normalization_reason_codes('["CUSTOMER_REVIEW_EXISTS","MANAGER_OUTCOME_EXISTS","SUBMITTED_DEUR_EXISTS"]'),
 'invoice',erp.order_legacy_normalization_reason_codes('["BILLING_EVIDENCE_EXISTS","INVOICE_OR_COLLECTION_EXISTS"]'),
 'recovery',erp.order_legacy_normalization_reason_codes('["BILLING_EVIDENCE_EXISTS","RECOVERY_EVIDENCE_EXISTS"]'),
 'terminal',erp.order_legacy_normalization_reason_codes('["CUSTOMER_REVIEW_EXISTS","RETURNED_OR_CLOSED_RENTAL"]'),
 'deduplicated',erp.order_legacy_normalization_reason_codes('["SUBMITTED_DEUR_EXISTS","SUBMITTED_DEUR_EXISTS"]')
) as precedence_probes;
