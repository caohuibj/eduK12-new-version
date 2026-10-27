const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto')
const root=path.resolve(__dirname,'../../..')
const source=path.join(root,'server-version/backend/src/modules/cognitive/content-candidates/continuous-recognition/practice.ts')
const target=path.join(root,'server-version/frontend/src/modules/cognitive/tasks/continuous-recognition/generated/practice.ts')
const body=fs.readFileSync(source,'utf8')
// Frontend Docker context does not contain backend source. Only this dependency-free rule body is copied.
if(/^import\s/m.test(body))throw Error('Recognition practice projection must remain dependency-free')
const output='// Pure recognition teaching contract. Backend SHA256: '+crypto.createHash('sha256').update(body).digest('hex')+'\n'+body
if(process.argv.includes('--check')){
  if(!fs.existsSync(target)||fs.readFileSync(target,'utf8')!==output)throw Error('Recognition practice projection drift')
}else{fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,output)}
process.stdout.write('Recognition pure practice projection matches backend source hash\n')
