const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),root=path.resolve(__dirname,'../../..'),source=path.join(root,'server-version/backend/src/modules/cognitive/content-candidates/gradcpt'),out=path.join(root,'server-version/frontend/src/modules/cognitive/tasks/gradcpt/generated')
for(const name of ['source-data.ts','assets.ts','protocol.ts','assignment.ts','analysis.ts','report.ts','COPYING.LESSER','LICENSE']){const body=fs.readFileSync(path.join(source,name),'utf8');if(name.endsWith('.ts')&&/^import .*from '(?!\.\/)/m.test(body))throw Error('GradCPT projection has an external runtime dependency')
 const text=name.endsWith('.ts')?'// Exact pure content projection. Backend SHA256: '+crypto.createHash('sha256').update(body).digest('hex')+'\n'+body:body,target=path.join(out,name)
 if(process.argv.includes('--check')){if(!fs.existsSync(target)||fs.readFileSync(target,'utf8')!==text)throw Error('GradCPT projection drift: '+name)}else{fs.mkdirSync(out,{recursive:true});fs.writeFileSync(target,text)}}
process.stdout.write('GradCPT pure content and LGPL notices match backend source\n')

require('./native-envelope.cjs')({source,out,check:process.argv.includes('--check')})
