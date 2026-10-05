import { execFileSync } from 'node:child_process';
const base=process.env.CI_BASE_SHA;
if(base) {
  if(!/^[a-f0-9]{40}$/.test(base)) throw new Error('Exact 40-character base SHA required');
  try { execFileSync('git',['cat-file','-e',base+'^{commit}'],{stdio:'ignore'}); }
  catch { execFileSync('git',['fetch','--no-tags','--depth=1','origin',base],{stdio:'inherit'}); }
}
