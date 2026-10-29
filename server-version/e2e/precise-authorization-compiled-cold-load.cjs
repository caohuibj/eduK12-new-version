// One actual CommonJS entry per fresh process. No HTTP, database query or seed.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto')
const root='/workspace/materials-load-20261029/backend-task1-scale-main-dc0-dist'
const cases={training:'modules/questionnaire-product/routes.js',survey:'modules/survey/platform.routes.js',
 education:'modules/huiteacher/platform.routes.js',approval:'modules/survey/standard-triplet.routes.js'}
const selected=process.env.PRECISE_CJS_CASE,output=process.env.PRECISE_CJS_OUTPUT
assert.equal(process.env.PRECISE_COMPILED_COLD_LOAD,'1');assert.equal(process.env.NODE_ENV,'test')
assert(Object.hasOwn(cases,selected),'Unknown compiled entry');assert.equal(fs.realpathSync(root),root)
assert(output?.startsWith('/workspace/materials-load-20261029/evidence/')&&output.endsWith('.json'))
assert(!fs.existsSync(output),'Read the existing cold-load result before retry')
const result={schemaVersion:1,case:selected,module:cases[selected],node:process.version,startedAt:new Date().toISOString(),
 scope:'Compiled entry initialization only; no database query, HTTP, grant, seed or FINAL. Education router serves both original School and Teacher adapters.',
 productionAccessed:false,sourceRunnerSha256:crypto.createHash('sha256').update(fs.readFileSync(__filename)).digest('hex')}
async function main(){
 const start=performance.now(),filename=path.join(root,cases[selected])
 try{
  const value=require(filename)
  assert(Object.values(value).some(item=>typeof item==='function'),'Actual compiled router export missing')
  result.compiledEntrySha256=crypto.createHash('sha256').update(fs.readFileSync(filename)).digest('hex')
  result.elapsedMs=performance.now()-start;result.status='PASS'
 }catch(error){result.status='FAIL';result.error={name:error.name,message:error.message};process.exitCode=1}
 finally{
  const queue=path.join(root,'config/queue.js'),database=path.join(root,'config/database.js')
  if(require.cache[queue])await require.cache[queue].exports.closeQueues(true)
  if(require.cache[database])await require.cache[database].exports.prisma.$disconnect()
  result.finishedAt=new Date().toISOString();fs.writeFileSync(output,JSON.stringify(result,null,2)+'\n',{flag:'wx'})
 }
}
main().catch(error=>{console.error(error.message);process.exitCode=1})
