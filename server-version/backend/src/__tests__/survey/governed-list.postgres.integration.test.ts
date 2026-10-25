import {randomUUID} from 'node:crypto'
import {afterAll,beforeAll,describe,expect,it} from 'vitest'
import {prisma as db} from '../../config/database'
import {canonicalHash} from '../../modules/assessment-runtime/canonical'
import {artifactReference,governedSnapshot,type GovernedArtifact} from '../../modules/survey/governed-tool.model'
import {governedCatalog,governedComponentOptions,governedSources,approveGovernedTool,governedRow} from '../../modules/survey/governed-tool.service'
import {packageGrantsForManager,packageGrantsForResearcher,importSurveyPackage,listProjectPackageImports,selectedPackageMemberships} from '../../modules/survey/governed-package.service'
import {changeSurveyToolPolicy} from '../../modules/survey/library-admin.service'
import {SURVEY_GONOGO_CONFIG} from '../../modules/survey/cognitive.definition'
const suite=process.env.SURVEY_GOVERNED_LIST_ISOLATED==='1'?describe:describe.skip
suite('bounded exact-version catalog and grant lists on synthetic PostgreSQL',()=>{
 let system:string,manager:string,owner:string,projectId:string
 const proof={adminVerifiedAt:Math.floor(Date.now()/1000),adminSessionId:randomUUID(),tokenVersion:0}
 const prefix='paging-'+randomUUID(),ids:string[]=[],hashes:string[]=[]
 beforeAll(async()=>{
  const u=new URL(process.env.DATABASE_URL!);if(u.hostname!=='127.0.0.1'||u.port!=='55433'||!u.pathname.startsWith('/survey_alltools_test_'))throw Error('Dedicated synthetic DB required')
  const user=async(role:'STANDARD'|'SYSTEM_ADMIN',domain:'TRAINING'|'SURVEY')=>(await db.user.create({data:{username:prefix+randomUUID(),passwordHash:'synthetic-only',platformRole:role,accountDomain:domain}})).id
  system=await user('SYSTEM_ADMIN','TRAINING');manager=await user('STANDARD','TRAINING');owner=await user('STANDARD','SURVEY')
  await db.adminEntryGrant.create({data:{id:randomUUID(),userId:manager,entry:'SURVEY',grantedBy:system}})
  const login='p'+randomUUID().replace(/-/g,'').slice(0,18);await db.surveyAccount.create({data:{userId:owner,loginName:login,normalizedLogin:login}});await db.surveyResearcherGrant.create({data:{userId:owner,status:'ACTIVE',grantedBy:manager}})
  await db.surveyMfaCredential.create({data:{userId:owner,enabled:true,secretCipher:'synthetic-only'}})
  projectId=randomUUID();await db.surveyProject.create({data:{id:projectId,ownerUserId:owner,title:'Synthetic paged catalog',collectionMode:'SINGLE_UNLINKED'}})
  // Each synthetic immutable version starts unapproved and runs the real
  // approval/trial path. Keep database transition guards fully enabled.
  for(let i=0;i<28;i++){
   const id=randomUUID(),definition={schemaVersion:2,pages:[{pageKey:'p',title:'Synthetic',questions:[{itemKey:'text',type:'SHORT_TEXT',prompt:'DO_NOT_TRANSMIT_EXECUTABLE_BODY',required:false,options:[],rows:[]}]}]}
   const a:GovernedArtifact={schemaVersion:1,family:'FORM',toolKey:'form_'+id.replace(/-/g,''),version:'content-'+i,title:prefix+' Form '+String(i).padStart(2,'0'),unit:{ref:{kind:'FORM',sourceId:'synthetic:'+id,sourceVersion:'source-'+i},title:'Synthetic',compiledDefinition:definition,displayDefinition:definition,definitionDigest:canonicalHash(definition),scoringDigest:null,adapterVersion:'survey-catalog-v1',provenance:{}},parameters:null,report:null,components:[],packageReport:null,reference:artifactReference('FORM',id,{})}
   const hash=canonicalHash(a);ids.push(id);hashes.push(hash)
   await db.$executeRaw`INSERT INTO survey_governed_tools(id,family,tool_key,tool_version,title,snapshot,snapshot_hash,reference,submitted_by,state) VALUES(${id},'FORM',${a.toolKey},${a.version},${a.title},${JSON.stringify(a)}::jsonb,${hash},${JSON.stringify(a.reference)}::jsonb,${system},'SUBMITTED')`
   const approved=await approveGovernedTool(system,id,{expectedVersion:1,hash,decision:'APPROVE',reason:'Synthetic list fixture approval'},proof);expect(approved.state).toBe('ONLINE')
   const fixed=governedSnapshot(await governedRow(db,id))
   const bid=randomUUID(),bundle:GovernedArtifact={...a,family:'BUNDLE',toolKey:'bundle_'+bid.replace(/-/g,''),title:prefix+' Bundle '+String(i).padStart(2,'0'),unit:null,reference:artifactReference('BUNDLE',bid,{}),components:[{slotKey:'form',title:'Fixed form '+i,source:{type:'GOVERNED',id,hash},unit:fixed}],packageReport:{version:'report-'+i,title:'Synthetic',introduction:'Synthetic report',blocks:[],disclaimer:''}},bhash=canonicalHash(bundle)
   await db.$executeRaw`INSERT INTO survey_governed_tools(id,family,tool_key,tool_version,title,snapshot,snapshot_hash,reference,submitted_by,state) VALUES(${bid},'BUNDLE',${bundle.toolKey},${bundle.version},${bundle.title},${JSON.stringify(bundle)}::jsonb,${bhash},${JSON.stringify(bundle.reference)}::jsonb,${system},'SUBMITTED')`
   const online=await approveGovernedTool(system,bid,{expectedVersion:1,hash:bhash,decision:'APPROVE',reason:'Synthetic package fixture approval'},proof);expect(online.state).toBe('ONLINE')
   await db.$executeRaw`INSERT INTO survey_tool_policies(resource_key,fingerprint,decision,paused,version,reason,reviewed_by) VALUES(${'governed-release:'+bid},${bhash},'APPROVED',false,1,'Synthetic scope',${manager})`
   await db.$executeRaw`INSERT INTO survey_package_grants(id,tool_id,snapshot_hash,user_id,created_by,reason,valid_from,expires_at) VALUES(${randomUUID()},${bid},${bhash},${owner},${manager},'Synthetic exact grant',${i===27?new Date(0):new Date()},${i===27?new Date(1000):null})`
   await db.cognitiveTestConfig.create({data:{id:prefix+'-source-'+String(i).padStart(2,'0'),testType:'gonogo',configVersion:i===27?'1.1.0':prefix+'-'+i,name:prefix+' Source '+String(i).padStart(2,'0'),engineVersion:'1.0.0',scoringVersion:'1.0.0',status:'PUBLISHED',accessPolicy:'OPEN',config:SURVEY_GONOGO_CONFIG}})
  }
 },60000)
 afterAll(async()=>{await (await import('../../config/queue')).closeQueues(true);await db.$disconnect()})
 it('paginates 28 catalog rows and returns exact component axes without executable bodies',async()=>{
  const first=await governedCatalog(system,{family:'BUNDLE',page:1,query:prefix}),second=await governedCatalog(system,{family:'BUNDLE',page:2,query:prefix})
  expect(first.list).toHaveLength(25);expect(first.hasMore).toBe(true);expect(second.list).toHaveLength(3);expect(second.hasMore).toBe(false)
  expect(new Set([...first.list,...second.list].map(r=>r.id)).size).toBe(28)
  expect(JSON.stringify(first)).not.toContain('DO_NOT_TRANSMIT_EXECUTABLE_BODY')
  expect(first.list[0].components[0].versions).toMatchObject({content:expect.stringMatching(/^source-/),parameters:null,report:null})
  expect((await governedCatalog(system,{family:'BUNDLE',page:1,query:prefix+' Bundle 27'})).list).toHaveLength(1)
 })
 it('pages and searches components beyond the old 200/first-page cutoffs',async()=>{
  const one=await governedComponentOptions(system,1,prefix),two=await governedComponentOptions(system,2,prefix)
  expect(one.list).toHaveLength(25);expect(one.hasMore).toBe(true);expect(two.list).toHaveLength(3);expect(two.hasMore).toBe(false)
  expect((await governedComponentOptions(system,1,hashes[27])).list[0].source.id).toBe(ids[27])
 })
 it('discovers raw source page two and searches before applying pagination',async()=>{
  const first=await governedSources(system,'COGNITIVE',1,prefix),second=await governedSources(system,'COGNITIVE',2,prefix)
  expect(first.list).toHaveLength(25);expect(first.hasMore).toBe(true);expect(second.list).toHaveLength(3);expect(second.list.some(s=>s.available)).toBe(true)
  const match=await governedSources(system,'COGNITIVE',1,prefix+' Source 27');expect(match.list).toHaveLength(1);expect(match.list[0].available).toBe(true)
 })
 it('returns hasMore for both grant audiences and exposes expired ACTIVE as blocked',async()=>{
  const one=await packageGrantsForManager(manager,owner,1,prefix),two=await packageGrantsForResearcher(owner,projectId,2,prefix)
  expect(one.list).toHaveLength(25);expect(one.hasMore).toBe(true);expect(two.list).toHaveLength(3);expect(two.hasMore).toBe(false)
  const expired=await packageGrantsForResearcher(owner,projectId,1,prefix+' Bundle 27')
  expect(expired.list[0].status).toBe('ACTIVE');expect(expired.list[0].availability).toMatchObject({ready:false,reasons:expect.arrayContaining(['整包授权已到期'])})
  await expect(packageGrantsForManager(system,owner,1)).rejects.toMatchObject({statusCode:403})
 })
 it('returns exact versions and current entry blockers for imported wave packages without executable bodies',async()=>{
  const grants=await packageGrantsForResearcher(owner,projectId,1,prefix+' Bundle 00'),grant=grants.list[0]
  const imported=await importSurveyPackage(owner,projectId,grant.id,randomUUID())
  const current=await listProjectPackageImports(owner,projectId,1)
  expect(current.list[0]).toMatchObject({id:imported.importId,versions:grant.versions,bindings:imported.bindings,availability:{ready:true,requiresFreshCheck:true,summaryOnly:true}})
  expect(current.list[0].components[0].versions).toMatchObject({content:'source-0',parameters:null,report:null})
  expect(JSON.stringify(current)).not.toContain('DO_NOT_TRANSMIT_EXECUTABLE_BODY')
  await changeSurveyToolPolicy(manager,{resourceKey:'governed-release:'+grant.toolId,fingerprint:grant.hash,expectedVersion:1,decision:'APPROVED',paused:true,reason:'Synthetic current pause'})
  expect((await listProjectPackageImports(owner,projectId,1)).list[0].availability).toMatchObject({ready:false,reasons:expect.arrayContaining(['此版本 Survey 使用已暂停'])})
  await expect(listProjectPackageImports(manager,projectId,1)).rejects.toMatchObject({statusCode:404})
 })
 it('reads selected membership beyond import 25 and keeps two instances of one version distinct',async()=>{
  const grant=(await packageGrantsForResearcher(owner,projectId,1,prefix+' Bundle 01')).list[0],imports=[]
  for(let n=0;n<26;n++)imports.push(await importSurveyPackage(owner,projectId,grant.id,randomUUID()))
  const first=imports[0],last=imports[25]
  const result=await selectedPackageMemberships(owner,projectId,[first.bindings[0].draftId,last.bindings[0].draftId])
  expect(new Set(result.list.map(p=>p.id))).toEqual(new Set([first.importId,last.importId]))
  expect(new Set(result.list.map(p=>p.toolId)).size).toBe(1)
  expect(result.list.every(p=>p.bindings.length===1&&p.hash===grant.hash)).toBe(true)
  expect(JSON.stringify(result)).not.toContain('technicalGrantId');expect(JSON.stringify(result)).not.toContain('DO_NOT_TRANSMIT_EXECUTABLE_BODY')
  await expect(selectedPackageMemberships(manager,projectId,[last.bindings[0].draftId])).rejects.toMatchObject({statusCode:404})
 })
})
