'use strict'
// Current-batch browser consumers for the existing School/Teacher transport,
// authenticated sessions, production builds, source fixture and report gate.
const assert = require('node:assert/strict')
const path = require('node:path')
const {randomUUID} = require('node:crypto')
const {validateChromeEvidence}=require('./school-teacher-chrome.cjs')
const {validateReportBuildInputs}=require('./school-teacher-ui.cjs')
const feedback = '合成固定版本反馈：本次体验只用于自我反思，不是诊断。'
const withheld = '共用原版反馈不应向当前参与者开放。'
const checks = ['authorized-source-compose-freeze-reopen','one-parent-start-resume-final','per-block-permitted-feedback']

async function isSafeScreenshot(page,product) {
 return page.evaluate(product=>{
  if(!['SCHOOL','TEACHER'].includes(product))return false
  if(document.querySelector('.ht-secret,.hs-secret,.ht-mfa-setup'))return false
  const passwords=[...document.querySelectorAll('input[type=password]')]
  if(!passwords.length)return true
  // Teacher intentionally keeps its password form mounted in the closed native
  // account dialog. Only those two empty, unrendered controls are harmless;
  // open dialogs, retained values and every other password control still fail.
  if(product!=='TEACHER'||passwords.length!==2)return false
  const dialog=document.querySelector('dialog#ht-account-settings.ht-account-dialog')
  if(!(dialog instanceof HTMLDialogElement)||dialog.open||dialog.getClientRects().length)return false
  return passwords.every(input=>input.closest('dialog')===dialog&&input.value===''&&!input.getClientRects().length
   &&input.closest('form[aria-label="修改账号密码"]'))
   &&passwords.map(input=>input.autocomplete).sort().join(',')==='current-password,new-password'
 },product)
}

async function prepareApprovedSource({db,passwordHash,suffix,products}) {
 const admin=await db.user.create({data:{username:'self_library_admin_'+suffix,passwordHash,role:'ADMIN',platformRole:'SYSTEM_ADMIN',accountDomain:'LEGACY'}})
 const author=await db.user.create({data:{username:'self_library_author_'+suffix,passwordHash,accountDomain:'SURVEY'}})
 const login='self_source_'+suffix
 await db.surveyAccount.create({data:{userId:author.id,loginName:login,normalizedLogin:login}})
 await db.surveyResearcherGrant.create({data:{userId:author.id,status:'ACTIVE',grantedBy:admin.id}})
 await db.surveyMfaCredential.create({data:{userId:author.id,enabled:true,secretCipher:'synthetic-source-not-a-login-secret'}})
 const tools=require('../backend/dist/modules/survey/tool-library.service')
 const {publishToolMeasurement}=require('../backend/dist/modules/survey/tool-publication.service')
 const library=require('../backend/dist/modules/scale-library-governance/service')
 const {grantEducationLibraryUseInTransaction}=require('../backend/dist/modules/scale-library-governance/education-distribution')
 const title='合成获授权共用量表 '+suffix
 const draft=await tools.createTemplate(author.id,{requestId:randomUUID(),kind:'SCALE',title})
 const saved=await tools.saveTemplate(author.id,draft.id,{revision:draft.revision,title,definition:{schemaVersion:1,
  presentationMode:'ONE_BY_ONE',respondentType:'participant_self_report',aggregation:'mean',
  responseOptions:[{optionKey:'low',label:'共用低分选项',score:-0.5},{optionKey:'high',label:'共用高分选项',score:1.5}],
  dimensions:[{dimensionKey:'support',label:'独立共用支持体验',direction:'descriptive'}],
  items:[{itemKey:'shared_q',prompt:'合成共用原版题目',required:true,reverse:false,dimensionKeys:['support']}],
  rawScoreFeedback:{schemaVersion:1,rules:[{scoreKey:'support',ranges:[{key:'all',min:-1,max:2,includeMax:true,text:withheld}]}]},
 }})
 await tools.completeTemplate(author.id,saved.id,saved.revision)
 const release=await publishToolMeasurement(author.id,saved.id,saved.revision)
 const application=await library.submit(author.id,'SURVEY',{requestId:randomUUID(),releaseId:release.releaseId,
  metadata:{title,author:'Synthetic source author',copyright:'Self authored; redistribution allowed',applicability:'Isolated synthetic SELF fixture',scoringDescription:'Original signed fractional mean',reportDescription:'Original native feedback with no education audience contract'},
  educationApplicability:{schemaVersion:1,administrations:[{population:'STUDENT',responseMode:'SELF'},{population:'TEACHER',responseMode:'SELF'}]},
 })
 const approved=await library.review(admin.id,application.id,{expectedVersion:1,decision:'APPROVE',allowedProducts:['SURVEY','TRAINING'],reason:'Synthetic browser source prerequisite'})
 assert.ok(approved.entryId)
 for(const product of ['SCHOOL','TEACHER']) {
  await db.$transaction(tx=>grantEducationLibraryUseInTransaction(tx,admin.id,approved.entryId,{requestId:randomUUID(),product,
   organizationId:products[product].organizationId,scopeKind:'ORGANIZATION',userId:null}))
  products[product].library={entryId:approved.entryId,title}
 }
 const rows=await db.$queryRawUnsafe('SELECT snapshot_hash AS hash FROM scale_library_submissions WHERE id=$1',application.id)
 for(const product of ['SCHOOL','TEACHER'])products[product].library.contentHash=rows[0].hash
}

async function authorQuestionnaire(s,f,{suffix,toolsPage,report,out}) {
 const p=s.page,base='/organizations/'+f.organizationId+'/private-tools'
 const form={schemaVersion:2,pages:[{pageKey:'reflection',title:'合成表单区段',questions:[{
  itemKey:'reflection',type:'SHORT_TEXT',prompt:'SELF 合成反思题',required:true,options:[],rows:[],
 }]}]}
 const fixed={}
 // Real authenticated authoring APIs prepare the two private source leaves;
 // the questionnaire itself is selected, edited and frozen in the real App.
 for(const [kind,definition] of [['SCALE',f.definitions.scale],['FORM',form]]) {
  const draft=await s.api(base,'POST',{kind,title:s.product+' 合成固定来源 '+kind+' '+suffix})
  const uri=base+'/'+draft.id,saved=await s.api(uri,'PUT',{expectedRevision:draft.revision,title:draft.title,definition})
  fixed[kind]=await s.api(uri+'/freeze','POST',{expectedRevision:saved.revision,expectedContentHash:saved.contentHash})
 }
 await toolsPage(s,f)
 await p.getByRole('button',{name:'普通问卷',exact:true}).click()
 const studio=p.getByRole('region',{name:'普通问卷编制',exact:true}),title=s.product+' 合成完整普通问卷 '+suffix
 await studio.getByLabel('问卷名称',{exact:true}).fill(title)
 const draft=await s.click(studio.getByRole('button',{name:'新建普通问卷',exact:true}),base)
 for(const kind of ['SCALE','FORM']) {
  await studio.getByRole('button',{name:'选择固定版本 · '+fixed[kind].title,exact:true}).click()
  await studio.getByRole('region',{name:'选择工具版本',exact:true}).getByRole('button',{
   name:'加入问卷 · 修订 '+fixed[kind].sourceRevision,exact:true}).click()
 }
 await studio.getByRole('navigation',{name:'问卷工具来源',exact:true}).getByRole('button',{name:'获授权共用量表',exact:true}).click()
 const catalog=studio.getByRole('region',{name:'获授权共用量表',exact:true})
 await catalog.locator('article').filter({has:p.getByText(f.library.title,{exact:true})}).getByRole('button',{name:'加入共用量表',exact:true}).click()
 const instruction='合成固定问卷说明 '+suffix
 await studio.getByRole('textbox',{name:'问卷说明',exact:true}).fill(instruction)
 for(let n=1;n<=3;n++)await studio.getByRole('textbox',{name:'工具衔接说明 '+n,exact:true}).fill('合成固定工具说明 '+n)
 const uri=base+'/'+draft.id
 await s.click(studio.getByRole('button',{name:'保存问卷草稿',exact:true}),uri,'PUT')
 const saved=await s.api(uri)
 assert.deepEqual(saved.definition.blocks.map(b=>b.source.provider),['PRIVATE_VERSION','PRIVATE_VERSION','LIBRARY_SCALE'])
 assert.deepEqual(saved.definition.blocks.map(b=>b.source.versionId),[fixed.SCALE.id,fixed.FORM.id,f.library.entryId])
 await studio.getByRole('button',{name:'预览问卷',exact:true}).click()
 const preview=studio.getByRole('region',{name:'问卷内容预览',exact:true})
 await preview.getByText('合成固定工具说明 1',{exact:true}).waitFor()
 await preview.getByRole('button',{name:'下一工具',exact:true}).click()
 await preview.getByText('SELF 合成反思题（必答）',{exact:true}).waitFor()
 const previewResponse=p.waitForResponse(r=>new URL(r.url()).pathname===s.prefix+base+'/library-sources/'+f.library.entryId&&r.request().method()==='GET')
 await preview.getByRole('button',{name:'下一工具',exact:true}).click()
 const response=await previewResponse;assert.equal(response.status(),200)
 const display=(await response.json()).data.definition
 assert.deepEqual(['scoring','report','referencePolicy'].filter(k=>k in display),[])
 assert.ok(display.responseSets.every(set=>set.options.every(option=>!('score'in option))))
 await preview.getByText('1. 合成共用原版题目',{exact:true}).waitFor()
 const version=await s.click(studio.getByRole('button',{name:'固定问卷版本',exact:true}),uri+'/freeze')
 assert.ok(version.id&&version.contentHash)
 await studio.getByRole('button',{name:'返回普通问卷列表',exact:true}).click()
 await p.getByRole('button',{name:'编辑 '+title,exact:true}).click()
 await studio.getByRole('textbox',{name:'问卷说明',exact:true}).waitFor()
 assert.equal(await studio.getByRole('textbox',{name:'问卷说明',exact:true}).inputValue(),instruction)
 // Preserve a later draft without changing the fixed version used below.
 await studio.getByRole('textbox',{name:'问卷说明',exact:true}).fill('后续草稿不应成为已固定作答说明')
 await s.click(studio.getByRole('button',{name:'保存问卷草稿',exact:true}),uri,'PUT')
 const file='screenshots/'+s.product.toLowerCase()+'-ordinary-author.png'
 assert.equal(await isSafeScreenshot(p,s.product),true,'Screenshot must not expose authentication controls or secrets')
 await p.screenshot({path:path.join(out,file),fullPage:true});report.screenshots.push({product:s.product,file})
 report.coverage.push({product:s.product,check:checks[0],sourceProviders:['PRIVATE_VERSION','PRIVATE_VERSION','LIBRARY_SCALE'],fixedVersion:true,reopened:true,displayOnly:true})
 return {...version,title,instruction}
}

async function participant(s,f,w,version,{author,report,out}) {
 const p=s.page,list=async()=>s.product==='SCHOOL'?(await s.api('/my/activity-tasks?page=1&pageSize=25')).list.filter(t=>t.activityId===w.id)
  :(await s.api('/my-assessment-tasks?pageSize=25')).list.filter(t=>t.eventId===w.id)
 const task=(await list()).find(t=>t.title===(s.product==='SCHOOL'?w.runName:version.title));assert.ok(task)
 const executionId=task.executionId||task.id
 const card=()=>s.product==='SCHOOL'?p.locator('article.hs-task-card[data-task-id='+JSON.stringify(executionId)+']'):
  p.locator('article.ht-event').filter({has:p.locator('strong').filter({hasText:version.title})})
 async function open() {
  const fresh=(await list()).find(t=>(t.executionId||t.id)===executionId);assert.ok(fresh)
  const loaded=p.waitForResponse(r=>r.request().method()==='GET'&&new RegExp('^'+s.prefix+'/(?:assessment-)?composite-attempts/[^/]+$').test(new URL(r.url()).pathname))
  await card().getByRole('button',{name:s.product==='SCHOOL'?'开始／继续官方测评':fresh.runtimeBindingRef?'继续测评':'开始测评',exact:true}).click()
  if(s.product==='SCHOOL'||!fresh.runtimeBindingRef) {
   const consent=p.getByRole('checkbox',{name:s.product==='SCHOOL'?'我已阅读本次测评的用途与可见性说明，自愿同意作答。':'我已阅读用途与可见性说明，自愿同意作答。',exact:true})
   if(await consent.count())await consent.check()
   await p.getByRole('button',{name:s.product==='SCHOOL'?'开始或继续正式测评':'开始或继续测评',exact:true}).click()
  }
  const response=await loaded;assert.equal(response.status(),200);return (await response.json()).data
 }
 if(s.product==='SCHOOL')await p.goto(s.origin+'/workspace/tasks')
 let state=await open(),attemptId=state.id
 assert.equal(state.deliveryMode,'FINAL_ONLY')
 const endpoint=(s.product==='SCHOOL'?'/composite-attempts/':'/assessment-composite-attempts/')+attemptId
 for(let index=0;index<3;index++) {
  assert.equal(state.status,'IN_PROGRESS');assert.equal(state.id,attemptId)
  const item=state.currentItem;assert.ok(item)
  await p.getByRole('region',{name:'本段作答说明',exact:true}).getByText('合成固定工具说明 '+(index+1),{exact:true}).waitFor()
  if(index!==1) {
   assert.equal(item.type,'SCALE')
   const option=p.getByRole('button',{name:index===0?'合成量表选项乙':'共用高分选项',exact:true})
   await option.click()
   if(index===0) {
    await p.getByRole('button',{name:'保存并退出',exact:true}).click()
    state=await open();assert.equal(state.id,attemptId);assert.equal(state.currentItem.id,item.id)
    assert.equal(await p.getByRole('button',{name:'合成量表选项乙',exact:true}).getAttribute('aria-pressed'),'true')
   }
   const submitted=p.waitForResponse(r=>r.request().method()==='POST'&&/\/scale\/submit$/.test(new URL(r.url()).pathname))
   await p.getByRole('button',{name:'提交整份量表',exact:true}).click();assert.equal((await submitted).status(),200)
  } else {
   assert.equal(item.type,'FORM_SECTION')
   const player=p.locator('.form-player');await player.getByRole('textbox').fill('合成描述性反思，不计心理分数')
   const submitted=p.waitForResponse(r=>r.request().method()==='POST'&&/\/form-sections\/[^/]+\/submit$/.test(new URL(r.url()).pathname))
   await player.getByRole('button',{name:'提交本页',exact:true}).click();assert.equal((await submitted).status(),200)
  }
  state=await s.api(endpoint+'?view=current-unit')
 }
 assert.equal(state.status,'COMPLETED')
 const completed=(await list()).find(t=>(t.executionId||t.id)===executionId);assert.equal(completed.status,'COMPLETED')
 report.coverage.push({product:s.product,check:checks[1],parentCount:1,sourceUnits:3,resumed:true,status:'COMPLETED'})
 if(s.product==='SCHOOL') {
  await p.goto(s.origin+'/workspace/tasks')
  await card().getByRole('button',{name:'查看我的测评反馈',exact:true}).click()
 }
 const visible=p.getByRole('region',{name:'获准的个人测评反馈',exact:true})
 await visible.getByText(feedback,{exact:true}).waitFor()
 assert.equal(await visible.getByText(withheld,{exact:true}).count(),0)
 const data=await s.api('/run-executions/'+executionId+'/feedback')
 assert.equal(data.mode,'COMPOSITION');assert.equal(data.units.length,3)
 assert.deepEqual(data.units.map(u=>u.state),['READY','COMPLETION_ONLY','WITHHELD'])
 assert.ok(!JSON.stringify(data).includes(withheld))
 await author.api('/run-executions/'+executionId+'/feedback','GET',undefined,[404])
 const file='screenshots/'+s.product.toLowerCase()+'-ordinary-feedback.png'
 assert.equal(await isSafeScreenshot(p,s.product),true,'Screenshot must not expose authentication controls or secrets')
 await p.screenshot({path:path.join(out,file),fullPage:true});report.screenshots.push({product:s.product,file})
 report.coverage.push({product:s.product,check:checks[2],states:['READY','COMPLETION_ONLY','WITHHELD'],authorDenied:true})
}

function verifyReport(report,identity,read) {
 assert.equal(report.schemaVersion,1);assert.equal(report.status,'PASSED');assert.equal(report.browserMode,'SELF_COMPOSITION')
 assert.deepEqual(report.layoutDetector,{status:'PASSED',closedVisibleClips:1,openVisibleClips:2})
 assert.deepEqual(report.source,{head:identity.head,tree:identity.tree});assert.equal(report.runId,identity.runId)
 assert.deepEqual(report.errors,[])
 assert.deepEqual(validateChromeEvidence(report.chrome),{ok:true,code:'CHROME_EVIDENCE_VERIFIED'})
 assert.equal(report.chrome.launchedVersion,report.chrome.preflight.package.browserVersion)
 assert.deepEqual(report.startups,['SCHOOL','TEACHER'].map(product=>({product,corsOrigin:'https://'+product.toLowerCase()+'.eduk12.top',ready:true,phase:'READY'})))
 assert.deepEqual(report.storageModes,[{product:'SCHOOL',compactFactsEnabled:false},{product:'TEACHER',compactFactsEnabled:false}])
 validateReportBuildInputs(report,identity)
 const expected=['SCHOOL','TEACHER'].flatMap(product=>checks.map(check=>product+':'+check))
 const actual=report.coverage.filter(row=>checks.includes(row.check)).map(row=>row.product+':'+row.check)
 assert.deepEqual(actual.sort(),expected.sort());assert.equal(new Set(actual).size,6)
 for(const product of ['SCHOOL','TEACHER']) {
  const rows=report.coverage.filter(row=>row.product===product)
  assert.ok(rows.some(row=>row.check===checks[0]&&row.fixedVersion&&row.reopened&&row.displayOnly&&JSON.stringify(row.sourceProviders)==='["PRIVATE_VERSION","PRIVATE_VERSION","LIBRARY_SCALE"]'))
  assert.ok(rows.some(row=>row.check===checks[1]&&row.parentCount===1&&row.sourceUnits===3&&row.resumed&&row.status==='COMPLETED'))
  assert.ok(rows.some(row=>row.check===checks[2]&&row.authorDenied&&JSON.stringify(row.states)==='["READY","COMPLETION_ONLY","WITHHELD"]'))
 }
 assert.equal(report.sessions.length,4)
 assert.deepEqual(report.sessions.map(s=>s.product+':'+s.actor).sort(),['SCHOOL:author','SCHOOL:participant','TEACHER:author','TEACHER:participant'])
 for(const s of report.sessions) {assert.deepEqual(s.pageErrors,[]);assert.deepEqual(s.unexpectedRequests,[]);assert.deepEqual(s.requestFailures,[]);assert.equal(s.authenticated,true)
  assert.deepEqual(s.failedResponses.filter(r=>!s.expectedFailures.includes(r.path+':'+r.status)),[])
  assert.deepEqual(s.consoleErrors.filter(row=>!row.network||!s.failedResponses.some(response=>response.path===row.path&&s.expectedFailures.includes(response.path+':'+response.status))),[])}
 assert.equal(report.screenshots.length,4)
 assert.equal(new Set(report.screenshots.map(s=>s.file)).size,4)
 for(const s of report.screenshots){assert(new RegExp('^screenshots/'+s.product.toLowerCase()+'-ordinary-(author|feedback)\\.png$').test(s.file))
  const png=read(s.file);assert(png.length>100);assert(png.subarray(0,8).equals(Buffer.from('89504e470d0a1a0a','hex')));assert.equal(png.readUInt32BE(16),1440);assert(png.readUInt32BE(20)>=400)}
 return {status:'PASSED',browserMode:'SELF_COMPOSITION',source:report.source,runId:report.runId,assertions:expected,screenshots:report.screenshots}
}
module.exports={prepareApprovedSource,authorQuestionnaire,participant,verifyReport,isSafeScreenshot,checks}
