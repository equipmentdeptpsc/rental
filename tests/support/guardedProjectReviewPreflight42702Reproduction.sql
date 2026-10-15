DO $$
BEGIN
  PERFORM erp.preflight_guarded_project_review_first_delivery(jsonb_build_object(
    'actorId','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','batchId','11111111-1111-4111-8111-111111111111',
    'deurNumber','DEUR-2026-999999','notificationIds',jsonb_build_array(
      '33333333-3333-4333-8333-333333333333','44444444-4444-4444-8444-444444444444'),
    'phase','BEFORE_PREPARATION'));
  RAISE EXCEPTION 'Expected SQLSTATE 42702 was not reproduced';
EXCEPTION WHEN ambiguous_column THEN
  IF SQLSTATE<>'42702' THEN RAISE; END IF;
  RAISE NOTICE 'Reproduced expected SQLSTATE 42702';
END $$;
