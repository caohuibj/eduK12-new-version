import { execFileSync } from 'node:child_process';
const base=process.env.CI_BASE_SHA;
const bases=new Set([base].filter(Boolean));
if(process.env.CI_EVENT==='pull_request'&&process.env.CI_SOURCE_HEAD){
 const parents=execFileSync('git',['cat-file','-p','HEAD'],{encoding:'utf8'}).split('\n').filter(line=>line.startsWith('parent ')).map(line=>line.slice(7));
 if(parents.length===2&&parents[1]===process.env.CI_SOURCE_HEAD)bases.add(parents[0]);
}
for(const base of bases) {
  if(!/^[a-f0-9]{40}$/.test(base)) throw new Error('Exact 40-character base SHA required');
  try { execFileSync('git',['cat-file','-e',base+'^{commit}'],{stdio:'ignore'}); }
  catch { execFileSync('git',['fetch','--no-tags','--depth=1','origin',base],{stdio:'inherit'}); }
}
