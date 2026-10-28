const path=require('node:path'),fs=require('node:fs'),assert=require('node:assert/strict'),root=path.resolve(__dirname,'../../../../..'),backend=path.join(root,'server-version/backend');
require(path.join(backend,'node_modules/tsx/dist/cjs/index.cjs'));
const {PrismaClient}=require(path.join(backend,'node_modules/@prisma/client'));
const {nativeCognitiveConfigSeeds}=require(path.join(backend,'src/modules/cognitive/content-candidates/native-registry/config-seeds.ts'));
const {installCognitiveConfigs}=require(path.join(backend,'src/modules/cognitive/onboarding/install.ts'));
(async()=>{const db=new PrismaClient();try{
 const seeds=nativeCognitiveConfigSeeds.filter(s=>!['mot','enumeration'].includes(s.testType)),rows=await db.cognitiveTestConfig.findMany({orderBy:{testType:'asc'}}),actor=await db.user.findUniqueOrThrow({where:{username:'remaining-cognitive-test-admin'}});
 assert.equal(rows.length,9);
 for(const seed of seeds){const row=rows.find(r=>r.testType===seed.testType);for(const key of ['name','testType','configVersion','engineVersion','scoringVersion','config','status'])assert.deepEqual(row[key],seed[key]);assert.equal(row.accessPolicy,'GRANT');assert.equal(row.publishedAt,null)}
 const result=await installCognitiveConfigs(db,{schemaVersion:1,items:seeds.map(({testType,configVersion,engineVersion,scoringVersion})=>({testType,configVersion,engineVersion,scoringVersion}))},actor.id);
 assert.deepEqual(result.rows.map(r=>r.action),seeds.map(()=>'ALREADY_PRESENT'));
 assert.deepEqual(await db.cognitiveTestConfig.findMany({orderBy:{testType:'asc'}}),rows);
 assert.equal(await db.assessmentManagementEvent.count({where:{action:'COGNITIVE_CONFIG_INSTALL'}}),9);
 assert.equal(await db.cognitiveAssignment.count(),0);
 const pins=await db.$queryRaw`SELECT measurement_release_id FROM cognitive_test_configs`;assert(pins.every(p=>p.measurement_release_id===null));
 fs.writeFileSync(path.join(__dirname,'installation-continued.json'),JSON.stringify({success:true,mode:'targeted continuation in original isolated database; preview/create not replayed',rows:result.rows,audits:9,assignments:0,published:0,releasePointers:0,unchangedRows:true},null,2));
}catch(e){console.error(e);process.exitCode=1}finally{await db.$disconnect()}})();
