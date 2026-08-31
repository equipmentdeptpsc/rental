import fs from 'node:fs';
const sql=fs.readFileSync('scripts/automation/uat-deploy.ps1','utf8');
if (!sql.includes('& $supabaseCli db push --linked')) throw new Error('missing foreground push');
if (sql.includes("Invoke-LoggedStep 'uat-migration-push'")) throw new Error('migration push still redirects streams');
console.log('uat deploy interactive path: PASS');
