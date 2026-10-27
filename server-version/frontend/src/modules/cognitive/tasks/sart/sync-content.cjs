const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto')
const source=path.resolve(__dirname,'../../../../../../backend/src/modules/cognitive/content-candidates/sart'),out=path.join(__dirname,'generated')
for(const name of ['protocol.ts','analysis.ts','report.ts']){
  const body=fs.readFileSync(path.join(source,name),'utf8')
  if(/^import .*from '(?!\.\/)/m.test(body))throw Error('SART pure projection has an external runtime dependency')
  const text='// Exact pure content projection. Backend SHA256: '+crypto.createHash('sha256').update(body).digest('hex')+'\n'+body,target=path.join(out,name)
  if(process.argv.includes('--check')){if(!fs.existsSync(target)||fs.readFileSync(target,'utf8')!==text)throw Error('SART projection drift: '+name)}else{fs.mkdirSync(out,{recursive:true});fs.writeFileSync(target,text)}
}
process.stdout.write('SART pure protocol/analysis/report match backend source\n')
