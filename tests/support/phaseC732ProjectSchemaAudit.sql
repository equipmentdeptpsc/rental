select json_build_object(
  'columns', (
    select json_agg(json_build_object(
      'name', column_name,
      'type', data_type,
      'nullable', is_nullable,
      'default', column_default
    ) order by ordinal_position)
    from information_schema.columns
    where table_schema = 'erp' and table_name = 'projects'
  ),
  'constraints', (
    select json_agg(json_build_object('name', conname, 'type', contype, 'definition', pg_get_constraintdef(oid)) order by conname)
    from pg_constraint
    where conrelid = 'erp.projects'::regclass
  ),
  'indexes', (
    select json_agg(json_build_object('name', indexname, 'definition', indexdef) order by indexname)
    from pg_indexes
    where schemaname = 'erp' and tablename = 'projects'
  ),
  'policies', (
    select json_agg(json_build_object('name', policyname, 'roles', roles, 'command', cmd, 'using', qual) order by policyname)
    from pg_policies
    where schemaname = 'erp' and tablename = 'projects'
  )
) as project_schema;
