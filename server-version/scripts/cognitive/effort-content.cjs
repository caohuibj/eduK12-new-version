const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),root=path.resolve(__dirname,'../../..')
const source=path.join(root,'server-version/backend/src/modules/cognitive/content-candidates/balloon-effort'),out=path.join(root,'server-version/frontend/src/modules/cognitive/tasks/balloon-effort/generated')
for(const name of ['protocol.ts','report.ts']){const body=fs.readFileSync(path.join(source,name),'utf8');if(/^import(?! .*from '\.\/protocol')/m.test(body))throw Error('Effort browser projection has a server dependency')
 const text='// Exact pure content projection. Backend SHA256: '+crypto.createHash('sha256').update(body).digest('hex')+'\n'+body,target=path.join(out,name)
 if(process.argv.includes('--check')){if(!fs.existsSync(target)||fs.readFileSync(target,'utf8')!==text)throw Error('Effort content projection drift: '+name)}else{fs.mkdirSync(out,{recursive:true});fs.writeFileSync(target,text)}}
process.stdout.write('Effort pure protocol/report match backend source\n')
