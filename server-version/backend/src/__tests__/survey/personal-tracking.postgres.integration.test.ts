import {beforeAll,afterAll,describe,it,expect} from 'vitest'
import {randomUUID} from 'node:crypto'
import express from 'express'
import {resolve} from 'node:path'
import {chromium} from 'playwright-core'
import {createServer as createViteServer} from 'vite'
import type {Server} from 'node:http'
import {PrismaClient} from '@prisma/client'
import {integrationDatabaseUrl,requireIsolatedReleaseDatabase} from '../integration/integration-env'
import {createDraft,updateDraft,reviseDraft} from '../../modules/survey/builder.service'
import {publishSurveyMeasurementDraft} from '../../modules/survey/measurement-publication.service'
import {createWave,createNextWave,getWave,updateWave,preflightWave} from '../../modules/survey/waves.service'
import {prepareWave,openWave} from '../../modules/survey/waves.publish'
import {joinLinkedStudy,startLinkedWave} from '../../modules/survey/admission.service'
import {getOwnResearchTask} from '../../modules/survey/task.public'
import {submitResearchFinal,readGeneralForOwnAttempt} from '../../modules/survey/final.service'
import {readSurveyPersonalChanges} from '../../modules/survey/personal-tracking.service'
import {revokeLinkedResearchAccess} from '../../modules/survey/identity.service'
import {publicSurveyRouter} from '../../modules/survey/public.routes'

const url=integrationDatabaseUrl('PERSONAL_TRACKING_DATABASE_URL')
const suite=url?describe:describe.skip
const uuid=()=>randomUUID(),key=()=> 'test'+uuid().replace(/-/g,'').slice(0,20)
suite('Survey personal tracking real publication/FINAL/HTTP loop',()=>{
  let db:PrismaClient,owner:string,projectId:string,server:Server,base:string
  let browserFixture:{publicId:string;firstWaveId:string;entryToken:string}|undefined
  const old={workspace:process.env.SURVEY_WORKSPACE_ENABLED,publication:process.env.SURVEY_PUBLICATION_ENABLED}
  beforeAll(async()=>{
    requireIsolatedReleaseDatabase(url!)
    process.env.SURVEY_WORKSPACE_ENABLED='true';process.env.SURVEY_PUBLICATION_ENABLED='true'
    db=new PrismaClient({datasources:{db:{url:url!}}})
    const admin=await db.user.create({data:{username:key(),passwordHash:'synthetic',role:'ADMIN',platformRole:'SYSTEM_ADMIN',accountDomain:'LEGACY'}})
    const person=await db.user.create({data:{username:key(),passwordHash:'synthetic',role:'STUDENT',accountDomain:'SURVEY'}});owner=person.id
    const alias=key();await db.surveyAccount.create({data:{userId:owner,loginName:alias,normalizedLogin:alias}})
    await db.surveyResearcherGrant.create({data:{userId:owner,status:'ACTIVE',grantedBy:admin.id}})
    await db.surveyMfaCredential.create({data:{userId:owner,enabled:true,secretCipher:'synthetic'}})
    projectId=uuid();await db.surveyProject.create({data:{id:projectId,ownerUserId:owner,title:'个人追踪合成研究',collectionMode:'LINKED_WAVES'}})
    const app=express();app.use(express.json());app.use('/api/public/survey',publicSurveyRouter)
    server=await new Promise<Server>(resolve=>{const listener=app.listen(0,'127.0.0.1',()=>resolve(listener))})
    const address=server.address();if(!address||typeof address==='string')throw new Error('No isolated HTTP listener')
    base='http://127.0.0.1:'+address.port+'/api/public/survey'
  })
  afterAll(async()=>{
    if(server)await new Promise<void>((resolve,reject)=>server.close(e=>e?reject(e):resolve()))
    await db?.$disconnect()
    if(old.workspace===undefined)delete process.env.SURVEY_WORKSPACE_ENABLED;else process.env.SURVEY_WORKSPACE_ENABLED=old.workspace
    if(old.publication===undefined)delete process.env.SURVEY_PUBLICATION_ENABLED;else process.env.SURVEY_PUBLICATION_ENABLED=old.publication
  })
  it('freezes selected leafs, inherits into T2, saves real answers and serves both reports with current identity fences',async()=>{
    const ids:string[]=[],toolKeys:string[]=[]
    for(const title of ['A','B','C','D']){
      const id=uuid(),instrumentKey=key();ids.push(id);toolKeys.push(instrumentKey)
      await createDraft(owner,projectId,{requestId:id,instrumentKey,kind:'SCALE',title})
      await updateDraft(owner,projectId,id,{revision:0,title,definition:{schemaVersion:1,respondentType:'participant_self_report',aggregation:'mean',
        responseOptions:[{optionKey:'zero',label:'0',score:0},{optionKey:'one',label:'1',score:1}],
        dimensions:[{dimensionKey:'total',label:'总分',direction:'descriptive'}],items:[{itemKey:'item',prompt:'合成问题',required:true,reverse:false,dimensionKeys:['total']}]}})
      await publishSurveyMeasurementDraft(owner,projectId,id,1)
    }
    const consent='这是合成研究，使用研究编号关联不同轮次回答，自愿参加，允许本人查看已披露指标的数值变化。'
    const first=await createWave(owner,projectId,{requestId:uuid(),title:'T1',consentText:consent,instrumentIds:ids,linkageNoticeConfirmed:true})
    await prepareWave(owner,projectId,first.id,0,undefined,ids.map(instrumentId=>({instrumentId,feedback:{policyVersion:'SURVEY_RAW_METRICS_V1',mode:'DESCRIPTIVE',metricKeys:['total'],release:'AFTER_FINAL'}})),
      {mode:'LONGITUDINAL',metrics:ids.slice(0,3).map(instrumentId=>({instrumentId,scoreKey:'total'}))})
    const frozen=await getWave(owner,projectId,first.id)
    expect(frozen.longitudinal?.metrics).toHaveLength(3)
    const t1=await openWave(owner,projectId,first.id,frozen.revision)
    const joined=await joinLinkedStudy({publicId:t1.publicId,waveId:first.id,entryToken:t1.entrySecret,consent:true,consentVersion:1})
    const proof={researchCode:joined.researchCode,accessCredential:joined.accessCredential}
    const task=await getOwnResearchTask({publicId:t1.publicId,attemptId:joined.attemptId,...proof})
    expect(task.units).toHaveLength(4)
    const answer=(count:number,value:string)=>Object.fromEntries(toolKeys.slice(0,count).map(k=>[k,{item:value}]))
    await submitResearchFinal({publicId:t1.publicId,attemptId:joined.attemptId,...proof,submissionId:uuid(),answers:answer(4,'zero')})
    const before=await db.surveyWaveFinal.findUniqueOrThrow({where:{attemptId:joined.attemptId}})
    const general=await readGeneralForOwnAttempt({publicId:t1.publicId,attemptId:joined.attemptId,...proof})
    expect(general.kind).toBe('DESCRIPTIVE')
    expect((await readSurveyPersonalChanges({publicId:t1.publicId,attemptId:joined.attemptId,...proof})).status).toBe('WAITING')
    const next=await createNextWave(owner,projectId,first.id,uuid())
    expect(next.longitudinalSourceWaveId).toBe(first.id)
    await updateWave(owner,projectId,next.id,{title:'T2 ABC',consentText:consent,instrumentIds:ids.slice(0,3),linkageNoticeConfirmed:true,revision:0})
    await prepareWave(owner,projectId,next.id,1)
    const frozen2=await getWave(owner,projectId,next.id)
    expect(frozen2.longitudinal?.metrics.map(m=>m.metricId)).toEqual(frozen.longitudinal?.metrics.map(m=>m.metricId))
    const t2=await openWave(owner,projectId,next.id,frozen2.revision)
    const started=await startLinkedWave({publicId:t1.publicId,waveId:next.id,...proof,consent:true,consentVersion:1})
    await submitResearchFinal({publicId:t1.publicId,attemptId:started.attemptId,...proof,submissionId:uuid(),answers:answer(3,'one')})
    const route=base+'/r/'+t1.publicId+'/attempts/'+started.attemptId+'/changes'
    const response=await fetch(route,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(proof)})
    expect(response.status).toBe(200)
    const body=await response.json() as {data:any}
    expect(body.data.status).toBe('AVAILABLE');expect(body.data.metrics).toHaveLength(3)
    expect(body.data.metrics[0].points.map((p:any)=>p.value)).toEqual([0,1])
    expect(body.data.metrics[0].adjacent[0].delta).toBe(1)
    expect(body.data.metrics[0].points[1].observedAt).toBeTruthy()
    const again=await readSurveyPersonalChanges({publicId:t1.publicId,attemptId:started.attemptId,...proof})
    expect(again).toEqual(body.data)
    expect(JSON.stringify(body)).not.toMatch(/credential|scopedSubjectId|attemptId|measurementHash|rawAnswers|resultsCipher/)
    const laterGeneral=await readGeneralForOwnAttempt({publicId:t1.publicId,attemptId:started.attemptId,...proof})
    expect(laterGeneral.kind).toBe('DESCRIPTIVE')
    expect(await db.surveyWaveFinal.findUniqueOrThrow({where:{attemptId:joined.attemptId}})).toEqual(before)
    const wrong=await fetch(route,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...proof,accessCredential:'Z'.repeat(43)})})
    expect(wrong.status).toBe(403)
    const other=uuid();await db.surveyProject.create({data:{id:other,ownerUserId:owner,title:'其他研究',collectionMode:'LINKED_WAVES',publicId:uuid()}})
    const stranger=await db.surveyProject.findUniqueOrThrow({where:{id:other}})
    await expect(readSurveyPersonalChanges({publicId:stranger.publicId!,attemptId:started.attemptId,...proof})).rejects.toMatchObject({statusCode:403})
    await revokeLinkedResearchAccess({projectId,...proof})
    await expect(readSurveyPersonalChanges({publicId:t1.publicId,attemptId:started.attemptId,...proof})).rejects.toMatchObject({statusCode:403})
    expect(t2.publicId).toBe(t1.publicId)
    browserFixture={publicId:t1.publicId,firstWaveId:first.id,entryToken:t1.entrySecret}
  },45000)
  ;(process.env.PERSONAL_TRACKING_BROWSER==='true'?it:it.skip)('renders real T1/T2 answers, single reports and a separate personal change report in Chromium',async()=>{
    if(!browserFixture){
      const source=await db.surveyWave.findFirst({where:{title:'T1',project:{title:'个人追踪合成研究'},status:'OPEN',publicationId:{not:null}},orderBy:{createdAt:'desc'},include:{project:true}})
      if(!source?.project.publicId)throw new Error('Publication fixture did not complete')
      projectId=source.projectId
      const {updateWaveEntryToken}=await import('../../modules/survey/waves.publish')
      const rotated=await updateWaveEntryToken({actorUserId:source.project.ownerUserId,projectId:source.projectId,waveId:source.id,revision:source.revision,action:'ROTATE'})
      if(!('entrySecret' in rotated)||!rotated.entrySecret)throw new Error('No synthetic recruitment token')
      browserFixture={publicId:source.project.publicId,firstWaveId:source.id,entryToken:rotated.entrySecret}
    }
    const fixture=browserFixture
    const identity=await joinLinkedStudy({publicId:fixture.publicId,waveId:fixture.firstWaveId,entryToken:fixture.entryToken,consent:true,consentVersion:1})
    const vite=await createViteServer({root:resolve('../frontend'),configFile:resolve('../frontend/vite.config.ts'),
      server:{host:'127.0.0.1',port:5179,strictPort:true,proxy:{'/api':{target:new URL(base).origin,changeOrigin:true}}}})
    await vite.listen()
    const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']})
    try{
      const page=await browser.newPage({viewport:{width:1100,height:900}}),errors:string[]=[]
      page.on('pageerror',error=>errors.push(error.message))
      await page.goto('http://survey.localhost:5179/r/'+fixture.publicId+'#'+new URLSearchParams({resume:'1',code:identity.researchCode,key:identity.accessCredential}),{waitUntil:'domcontentloaded',timeout:60000})
      for(const ordinal of [1,2]){
        if(ordinal===2)await page.getByRole('button',{name:/查看参与说明/}).click()
        await page.getByRole('checkbox',{name:/我已阅读并同意/}).check({timeout:45000})
        await page.getByRole('button',{name:'开始填写问卷',exact:true}).click()
        const radios=page.getByRole('radio',{name:ordinal===1?'0':'1',exact:true})
        await radios.first().waitFor({timeout:30000})
        const count=await radios.count();expect(count).toBe(ordinal===1?4:3)
        for(let index=0;index<count;index++)await radios.nth(index).check()
        const submitted=page.waitForResponse(r=>r.url().endsWith('/final')&&r.request().method()==='POST')
        await page.getByRole('button',{name:'提交本轮正式回答',exact:true}).click()
        expect((await submitted).status()).toBe(200)
        await page.getByRole('heading',{name:'本次表现反馈',exact:true}).waitFor()
        await page.getByRole('button',{name:'查看我的变化',exact:true}).click()
        if(ordinal===1){
          await page.getByText(/两轮有效、可比较且允许本人查看/).waitFor()
          await page.getByRole('button',{name:'返回我的研究波次',exact:true}).click()
        }else{
          await page.getByRole('table',{name:'A · 总分各轮记录'}).waitFor()
          expect(await page.getByText('T1 → T2：+1 points',{exact:true}).count()).toBe(3)
          await page.screenshot({path:'/tmp/longitudinal-survey-browser.png',fullPage:true})
        }
      }
      expect(errors).toEqual([])
    }catch(error){
      const pages=browser.contexts().flatMap(c=>c.pages());if(pages[0])await pages[0].screenshot({path:'/tmp/longitudinal-survey-browser-failure.png',fullPage:true});throw error
    }finally{await browser.close();await vite.close()}
  },150000)

  it('rejects changing a persisted frozen plan or a published next-wave source',async()=>{
    const first=await db.surveyWave.findFirst({where:{title:'T1',project:{title:'个人追踪合成研究'},status:'OPEN',publicationId:{not:null}},orderBy:{createdAt:'desc'},include:{project:true}})
    if(!first?.project.longitudinalPlan)throw new Error('No frozen synthetic plan')
    const next=await db.surveyWave.findFirst({where:{projectId:first.projectId,longitudinalSourceWaveId:first.id,publicationId:{not:null}}})
    if(!next)throw new Error('No frozen synthetic next wave')
    await expect(db.$executeRaw`UPDATE survey_projects SET longitudinal_plan=NULL WHERE id=${first.projectId}`).rejects.toThrow('Published personal tracking plan is immutable')
    await expect(db.$executeRaw`UPDATE survey_waves SET longitudinal_source_wave_id=NULL WHERE id=${next.id}`).rejects.toThrow('Published personal tracking source is immutable')
    expect((await db.surveyProject.findUniqueOrThrow({where:{id:first.projectId}})).longitudinalPlan).toEqual(first.project.longitudinalPlan)
  })

  it('inherits frozen tracked C after the same source draft is revised, while untracked Form edits remain current',async()=>{
    // Each independent T1 has its own project-level frozen tracking plan.
    const projectId=uuid()
    await db.surveyProject.create({data:{id:projectId,ownerUserId:owner,title:'固定来源继承合成研究',collectionMode:'LINKED_WAVES'}})
    const scaleId=uuid(),formId=uuid(),scaleKey=key(),formKey=key()
    const definition={schemaVersion:1,respondentType:'participant_self_report',aggregation:'mean',
      responseOptions:[{optionKey:'zero',label:'0',score:0},{optionKey:'one',label:'1',score:1}],dimensions:[{dimensionKey:'total',label:'总分',direction:'descriptive'}],
      items:[{itemKey:'original',prompt:'T1原题',required:true,reverse:false,dimensionKeys:['total']}]}
    await createDraft(owner,projectId,{requestId:scaleId,instrumentKey:scaleKey,kind:'SCALE',title:'冻结A'})
    await updateDraft(owner,projectId,scaleId,{revision:0,title:'冻结A',definition})
    await publishSurveyMeasurementDraft(owner,projectId,scaleId,1)
    const formDefinition={schemaVersion:1,pages:[{pageKey:'page',title:'说明',questions:[{itemKey:'note',type:'SHORT_TEXT',prompt:'旧说明',required:false,options:[],rows:[]}]}]}
    await createDraft(owner,projectId,{requestId:formId,instrumentKey:formKey,kind:'FORM',title:'可改D'})
    await updateDraft(owner,projectId,formId,{revision:0,title:'可改D',definition:formDefinition})
    const consent='通过原始研究编号关联不同轮次，自愿参加，本例只验证固定追踪测量来源与非追踪内容的独立修改。'
    const first=await createWave(owner,projectId,{requestId:uuid(),title:'固定来源T1',consentText:consent,instrumentIds:[scaleId,formId],linkageNoticeConfirmed:true})
    await prepareWave(owner,projectId,first.id,0,undefined,[{instrumentId:scaleId,feedback:{policyVersion:'SURVEY_RAW_METRICS_V1',mode:'DESCRIPTIVE',metricKeys:['total'],release:'AFTER_FINAL'}}],
      {mode:'LONGITUDINAL',metrics:[{instrumentId:scaleId,scoreKey:'total'}]})
    const source=await getWave(owner,projectId,first.id)
    const opened=await openWave(owner,projectId,first.id,source.revision)
    await reviseDraft(owner,projectId,scaleId,1)
    await updateDraft(owner,projectId,scaleId,{revision:2,title:'工具库新版A',definition:{...definition,responseOptions:definition.responseOptions.map(o=>({...o,score:o.score*9})),items:[{...definition.items[0],itemKey:'changed',prompt:'新版题目'}]}})
    await updateDraft(owner,projectId,formId,{revision:1,title:'新版D',definition:{...formDefinition,pages:[{...formDefinition.pages[0],title:'新说明'}]}})
    const next=await createNextWave(owner,projectId,first.id,uuid())
    expect(next.inheritedTrackingUnits?.find(u=>u.id===scaleId)?.definition).toMatchObject({items:[{itemKey:'original',prompt:'T1原题'}]})
    expect((await preflightWave(owner,projectId,next.id)).ok).toBe(true)
    await prepareWave(owner,projectId,next.id,0)
    const finalWave=await getWave(owner,projectId,next.id)
    await openWave(owner,projectId,next.id,finalWave.revision)
    const publication=await db.surveyPublication.findUniqueOrThrow({where:{id:finalWave.publicationId!}})
    const frozen=publication.compiledSnapshot as any
    expect(frozen.units.find((u:any)=>u.draftId===scaleId).displayDefinition.items[0].itemKey).toBe('original')
    expect(frozen.units.find((u:any)=>u.draftId===formId).displayDefinition.pages[0].title).toBe('新说明')
    // Read the actual task through a new participant admitted to T1, then T2.
    const joined=await joinLinkedStudy({publicId:opened.publicId,waveId:first.id,entryToken:opened.entrySecret,consent:true,consentVersion:1})
    const proof={researchCode:joined.researchCode,accessCredential:joined.accessCredential}
    const attempt=await startLinkedWave({publicId:opened.publicId,waveId:next.id,...proof,consent:true,consentVersion:1})
    await submitResearchFinal({publicId:opened.publicId,attemptId:attempt.attemptId,...proof,submissionId:uuid(),answers:{[scaleKey]:{original:'one'},[formKey]:{}}})
    const general=await readGeneralForOwnAttempt({publicId:opened.publicId,attemptId:attempt.attemptId,...proof})
    expect(general).toMatchObject({kind:'DESCRIPTIVE',measurements:[{metrics:[{key:'total',value:1}]}]})
    expect((await db.surveyInstrumentDraft.findUniqueOrThrow({where:{id:scaleId}})).definition).toMatchObject({items:[{itemKey:'changed'}]})
    const unlinked=await createWave(owner,projectId,{requestId:uuid(),title:'不能另起基线',consentText:consent,instrumentIds:[formId],linkageNoticeConfirmed:true})
    await expect(prepareWave(owner,projectId,unlinked.id,0)).rejects.toThrow('请通过已发布纵向波次创建下一轮')
  },30000)

})
