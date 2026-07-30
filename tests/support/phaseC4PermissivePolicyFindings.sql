SELECT tablename,policyname,roles,cmd,qual,with_check
FROM pg_policies
WHERE schemaname='erp' AND tablename NOT IN('app_permissions','app_roles','role_permissions')
  AND (qual='true' OR with_check='true')
ORDER BY tablename,policyname;
