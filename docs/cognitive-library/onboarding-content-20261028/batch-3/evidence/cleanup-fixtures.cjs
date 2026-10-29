const fs=require('fs'),path=require('path'),{createRequire}=require('module');
const root=path.resolve(__dirname,'../../../../..'),backend=path.join(root,'server-version/backend'),requireBackend=createRequire(path.join(backend,'package.json'));
const url=process.env.COGNITIVE_INTEGRATION_DB_URL;
if(url!=='postgresql://postgres@127.0.0.1:15433/cognitive_native_test?schema=batch3')throw Error('Only this run\'s disposable fixture schema is allowed');
requireBackend('dotenv').config=()=>({parsed:{}});Object.assign(process.env,{DATABASE_URL:url,NODE_ENV:'test',DATA_ENCRYPTION_KEY:'a'.repeat(64),DATA_PSEUDONYM_KEY:'b'.repeat(64)});requireBackend('tsx/cjs');const db=requireBackend(path.join(backend,'src/config/database')).prisma;
(async()=>{try{
 const retained=await db.course.findMany({where:{title:{startsWith:'native-content-'}},select:{id:true}}),ids=retained.map(r=>r.id);
 await db.courseStudent.deleteMany({where:{courseId:{in:ids}}});await db.course.deleteMany({where:{id:{in:ids}}});
 const mutable={configs:await db.cognitiveTestConfig.count(),assignments:await db.cognitiveAssignment.count(),sessions:await db.cognitiveSession.count(),storedAssets:await db.storedAsset.count(),courses:await db.course.count()};
 if(Object.values(mutable).some(n=>n!==0))throw Error('Unexpected mutable fixture remains: '+JSON.stringify(mutable));
 const [{count}]=await db.$queryRawUnsafe('SELECT count(*)::int AS count FROM measurement_content_releases');
 const receipt={node:process.version,mutable,removedOnlyOwnedCourseCount:ids.length,immutableReleaseCount:count,immutableReleasesRetained:true,syntheticActorsRetainedUntilContainerRemoval:true,globalSeed:false,production:false};
 fs.writeFileSync(path.join(__dirname,'cleanup-fixtures.json'),JSON.stringify(receipt,null,2)+'\n');console.log(receipt);
 }finally{await db.$disconnect()}})().catch(e=>{console.error(e.message);process.exitCode=1});
