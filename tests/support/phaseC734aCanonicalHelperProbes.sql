select json_build_object(
  'flat_reordered_equal', erp.canonical_deur_snapshot_text('{"b":2,"a":1}'::jsonb)=erp.canonical_deur_snapshot_text('{"a":1,"b":2}'::jsonb),
  'nested_reordered_equal', erp.canonical_deur_snapshot_text('{"outer":{"z":true,"a":null}}'::jsonb)=erp.canonical_deur_snapshot_text('{"outer":{"a":null,"z":true}}'::jsonb),
  'array_order_preserved', erp.canonical_deur_snapshot_text('[1,2,3]'::jsonb)<>erp.canonical_deur_snapshot_text('[3,2,1]'::jsonb),
  'mixed_deterministic', erp.canonical_deur_snapshot_text('{"items":[{"b":"x","a":false},null,2.5]}'::jsonb)=erp.canonical_deur_snapshot_text('{"items":[{"a":false,"b":"x"},null,2.5]}'::jsonb),
  'null_exact', erp.canonical_deur_snapshot_text('null'::jsonb)='null',
  'boolean_exact', erp.canonical_deur_snapshot_text('true'::jsonb)='true',
  'number_exact', erp.canonical_deur_snapshot_text('2.5'::jsonb)='2.5',
  'string_exact', erp.canonical_deur_snapshot_text('"value"'::jsonb)='"value"',
  'different_values_differ', erp.canonical_deur_snapshot_text('{"a":1}'::jsonb)<>erp.canonical_deur_snapshot_text('{"a":2}'::jsonb)
) as canonical_probes;
