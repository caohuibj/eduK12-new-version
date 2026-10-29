const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')
const root = path.resolve(__dirname, '../../..')
const source = path.join(root,'server-version/backend/src/modules/cognitive/content-candidates/mot/protocol.ts')
const target = path.join(root,'server-version/frontend/src/modules/cognitive/tasks/mot/generated/protocol.ts')
const text = fs.readFileSync(source,'utf8')
const hash = crypto.createHash('sha256').update(text).digest('hex')
const output = '// Generated from the pure MOT candidate protocol. Source SHA256: '+hash+'\n'+text
if(process.argv.includes('--check')){
  if(!fs.existsSync(target)||fs.readFileSync(target,'utf8')!==output)throw Error('MOT protocol projection drift')
}else{
  fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,output)
}
console.log('MOT pure protocol projection: '+hash)
