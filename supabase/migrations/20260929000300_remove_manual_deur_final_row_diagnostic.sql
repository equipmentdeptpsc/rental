-- Remove only the temporary final-row diagnostic boundary after its payload
-- has been reconciled with the live minute constraint.
DROP TRIGGER IF EXISTS zz_diagnose_manual_deur_correction_final_new_row ON erp.deurs;
DROP FUNCTION IF EXISTS erp.diagnose_manual_deur_correction_final_new_row();
