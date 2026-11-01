const {test}=require('node:test'),assert=require('node:assert/strict')
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm')
const root=path.resolve(__dirname,'../../..')
const script=path.join(root,'server-version/miniprogram-v2/scripts/feature-inventory.cjs')
const producers=['server-version/frontend/src/App.tsx','server-version/frontend/src/pages/organization/OrganizationProductRoutes.tsx']
const target='docs/miniprogram-v2/web-feature-inventory.json'
const sources=Object.fromEntries(producers.map(file=>[file,fs.readFileSync(path.join(root,file),'utf8')]))
const snapshot=JSON.parse(fs.readFileSync(path.join(root,target),'utf8'))
function run({source=sources,inventory=snapshot,check=true}={}){
 const writes=[]
 const content=typeof inventory==='string'?inventory:JSON.stringify(inventory)
 const fakeFs={readFileSync(file){
  const relative=path.relative(root,file)
  if(relative===target)return content
  if(Object.hasOwn(source,relative))return source[relative]
  throw new Error('Unexpected fixture read: '+relative)
 },writeFileSync(file,value){assert.equal(file,path.join(root,target));writes.push(value)}}
 vm.runInNewContext(fs.readFileSync(script,'utf8'),{
  require(name){if(name==='node:fs')return fakeFs;if(name==='node:path')return path;throw new Error('Unexpected import')},
  __dirname:path.dirname(script),process:{argv:check?['node',script,'--check']:['node',script]},console:{log(){}},
 },{filename:script})
 return writes
}
test('unchanged inventory and comment/blank-line shifts in both producers pass without writing',()=>{
 assert.deepEqual(run(),[])
 assert.deepEqual(run({source:Object.fromEntries(producers.map(file=>[file,'// diagnostic shift\n\n'+sources[file]]))}),[])
})
test('generation still retains real source line locators',()=>{
 const shifted=Object.fromEntries(producers.map(file=>[file,'// generation locator shift\n\n'+sources[file]]))
 const generated=JSON.parse(run({check:false,source:shifted})[0])
 const semantic=value=>({...value,features:value.features.map(row=>({...row,source:row.source.replace(/:[0-9]+$/,':LINE')}))})
 assert.deepEqual(semantic(generated),semantic(snapshot))
 assert(generated.features.every(row=>/:[1-9][0-9]*$/.test(row.source)))
})
test('real route and role changes still invalidate the inventory',()=>{
 for(const [before,after] of [['path="/login"','path="/login-new"'],["roles={['TEACHER', 'ADMIN']}","roles={['STUDENT']}"]]){
  const changed=sources[producers[0]].replace(before,after)
  assert.notEqual(changed,sources[producers[0]],before)
  assert.throws(()=>run({source:{...sources,[producers[0]]:changed}}),/stale/)
 }
})
test('only source line suffixes are diagnostic; parity and authorization fields still matter',()=>{
 for(const edit of [
  value=>value.features.pop(),value=>value.features.reverse(),
  value=>value.features[0].source='different/producer.tsx:1',
  ...['webRoute','roles','capability','apiDependency','status','implementationType','limitation'].map(key=>value=>{value.features[0][key]='changed'}),
  value=>{value.note='changed'},value=>{value.features[0].unexpected='changed'},
 ]){
  const value=structuredClone(snapshot);edit(value)
  assert.throws(()=>run({inventory:value}),/stale/)
 }
})
test('malformed/missing locators and malformed JSON fail closed',()=>{
 for(const source of [undefined,null,'producer.tsx','producer.tsx:0','producer.tsx:NaN']){
  const value=structuredClone(snapshot);value.features[0].source=source
  assert.throws(()=>run({inventory:value}),/Invalid feature source/)
 }
 assert.throws(()=>run({inventory:'invalid JSON'}))
})
