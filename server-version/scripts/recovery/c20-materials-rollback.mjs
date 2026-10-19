/** Real PostgreSQL transactional failure injection, scoped to fresh fixture IDs. */
import assert from 'node:assert/strict'
import {harness,prisma,PrismaClient,census,prefix,pub} from './c20-materials-client.mjs'
import {logins,formMaterialProduct} from './c20-materials-fixture.mjs'
const h=harness('rollback');let error,owner
const literal=v=>{assert.match(v,/^[a-zA-Z0-9_-]+$/);return "'"+v+"'"}
try{
 const f=h.read('c20-fixture-private.json'),{teacher}=await logins(h,f),runtime=h.read('runtime-private.json');assert.equal(new URL(runtime.DATABASE_URL_OWNER).hostname,'127.0.0.1')
 owner=new PrismaClient({datasources:{db:{url:runtime.DATABASE_URL_OWNER}}})
 for(const point of ['quota','token','native']){
  const product=await formMaterialProduct(teacher,f,{linkedPolicy:'RERANDOMIZE',limits:{a:10,b:10}}),token=await teacher.request(`${prefix}/${product.id}/public-tokens`,'POST',{expiresAt:new Date(Date.now()+1800000).toISOString(),maxUses:1}),client=h.client();await client.request('/auth/csrf')
  const table={quota:'training_material_quota_buckets',token:'composite_assessment_access_tokens',native:'composite_form_section_attempts'}[point]
  const condition=point==='quota'?`NEW.composite_id=${literal(product.id)}`:point==='token'?`NEW.id=${literal(token.id)}`:`EXISTS(SELECT 1 FROM composite_assessment_attempts WHERE id=NEW.attempt_id AND composite_assessment_id=${literal(product.id)})`
  const event=point==='native'?'INSERT':'UPDATE',fn='c20_test_fault_'+point
  const before=await census(),experiments=await prisma.trainingMaterialExperiment.findMany({orderBy:{id:'asc'}})
  try{
   await owner.$executeRawUnsafe(`CREATE FUNCTION ${fn}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF ${condition} THEN RAISE EXCEPTION 'C20 deliberate ${point} rollback'; END IF; RETURN NEW; END $$`)
   await owner.$executeRawUnsafe(`CREATE TRIGGER ${fn} AFTER ${event} ON ${table} FOR EACH ROW EXECUTE FUNCTION ${fn}()`)
   await client.request(`${pub}/${token.token}/start`,'POST',{},500)
   assert.deepEqual(await census(),before,'failed admission must roll back all parent/native/token/claim/quota writes')
   assert.deepEqual(await prisma.trainingMaterialExperiment.findMany({orderBy:{id:'asc'}}),experiments)
   h.check(point+': actual PostgreSQL trigger exception rolls back the entire public admission transaction')
  }finally{await owner.$executeRawUnsafe(`DROP TRIGGER IF EXISTS ${fn} ON ${table}`);await owner.$executeRawUnsafe(`DROP FUNCTION IF EXISTS ${fn}()`)}
 }
 assert.equal((await owner.$queryRawUnsafe("SELECT count(*)::int n FROM pg_proc WHERE proname LIKE 'c20_test_fault_%'"))[0].n,0)
 h.result.passed=true
}catch(e){error=e;throw e}finally{if(owner)await owner.$disconnect();await h.finish(error)}
