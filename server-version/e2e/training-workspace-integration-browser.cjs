/** PR327 bounded real Training workspace acceptance. No API/session mocks,
 * seeded publication/FINAL, media worker or repeated PR326 participant journey.
 * Native Training RUNNER_DEFAULT freezes ONE_BY_ONE. ALL_AT_ONCE is not requalified.
 * Requires separately approved isolated Chromium CA, never a TLS bypass.
 */
'use strict'
const assert=require('node:assert/strict')
const fs=require('node:fs')
const path=require('node:path')
const {randomUUID}=require('node:crypto')
const REQUIRED=['real-virtual-ctap2-administrator-session','real-exact-publication-review-grant','toolkit-exact-readonly','authorized-form-private-copy','student-course-frozen-native-mode','forged-hint-and-nonmember-denied','revoke-denies-new-use','frozen-final-historical-report-back-reload']
let fixture,output,browser
const evidence={schemaVersion:1,status:'RUNNING',phase:'prerequisites',checks:[],screenshots:[],accessibility:[],layoutChecks:[],keyboard:[],browserErrors:[],blockedExternalRequests:0,physicalSecurityKeyVerified:false,scope:'PR327 Training workspace only; native Training only, no Survey/media/admin UI regression; races owned by PostgreSQL gate'}
const save=()=>{if(output)fs.writeFileSync(path.join(output,'result.json'),JSON.stringify(evidence,null,2))}
const phase=name=>{evidence.phase=name;save()}
const check=name=>{assert(REQUIRED.includes(name));evidence.checks.push(name);save()}
const button=(scope,name)=>scope.getByRole('button',{name,exact:true})
const governance=product=>'/api/'+product.toLowerCase()+'/scale-library-governance'
async function parsed(response){
 const value=await response.json();assert.equal(response.status(),200,'HTTP action failed');assert.equal(value.code,0,'API action rejected');return value.data
}
async function action(page,endpoint,trigger,method='POST'){
 const [response]=await Promise.all([page.waitForResponse(r=>r.request().method()===method&&new URL(r.url()).pathname===endpoint),trigger()])
 return {data:await parsed(response),request:response.request()}
}
async function request(page,endpoint,method='GET',body,view='BUSINESS'){
 return page.evaluate(async({endpoint,method,body,view})=>{
  const headers={'Content-Type':'application/json','X-EduK12-Account-View':view}
  if(method!=='GET'){
   const response=await fetch('/api/auth/csrf',{credentials:'same-origin',headers})
   const csrf=await response.json();if(!response.ok||csrf.code!==0)throw new Error('CSRF rejected')
   headers['X-CSRF-Token']=csrf.data.csrfToken
  }
  const response=await fetch(endpoint,{method,credentials:'same-origin',headers,...(body===undefined?{}:{body:JSON.stringify(body)})})
  return {status:response.status,body:await response.json()}
 },{endpoint,method,body,view})
}
async function api(...args){
 const result=await request(...args)
 if(result.status!==200||result.body.code!==0){
  const code=result.body.code
  evidence.apiFailure={phase:evidence.phase,method:args[2]||'GET',status:result.status,code:typeof code==='number'&&Number.isFinite(code)?code:typeof code==='string'&&/^[A-Z][A-Z0-9_]{0,63}$/.test(code)?code:'UNCLASSIFIED'};save()
 }
 assert.equal(result.status,200,'API HTTP rejected');assert.equal(result.body.code,0,'API envelope rejected');return result.body.data
}
async function denied(page,endpoint,method='GET',body){
 const result=await request(page,endpoint,method,body)
 assert([403,404,409].includes(result.status),'Expected authorization/lifecycle rejection');assert.notEqual(result.body.code,0)
 return result.status
}
async function pageFor(origin=fixture.trainingUrl){
 const context=await browser.newContext({viewport:{width:1440,height:1000},locale:'zh-CN',timezoneId:'UTC',serviceWorkers:'block'})
 await context.route('**/*',async route=>{
  try{const url=new URL(route.request().url());if([fixture.trainingUrl].includes(url.origin))return await route.continue();evidence.blockedExternalRequests++;await route.abort('blockedbyclient')}
  catch{evidence.browserErrors.push({phase:evidence.phase,name:'RouteCallbackFailure'})}
 })
 const page=await context.newPage();page.setDefaultTimeout(20000)
 page.on('pageerror',()=>evidence.browserErrors.push({phase:evidence.phase,name:'PageError'}))
 // Verify the loopback server BEFORE submitting credentials, on every context.
 await page.goto(origin+'/__ci_marker')
 assert.deepEqual(JSON.parse(await page.locator('body').innerText()),{isolated:true,sourceCommit:process.env.GITHUB_SHA,ciRunId:process.env.GITHUB_RUN_ID})
 assert.equal(new URL(page.url()).origin,origin);assert(await page.evaluate(()=>isSecureContext))
 return page
}
async function trainingLogin(page,actor,student=false) {
  await page.goto(fixture.trainingUrl+(student?'/student/login':'/teacher/account-login'))
  await page.locator('#auth-username').fill(actor.username);await page.locator('#auth-password').fill(actor.password)
  await action(page,'/api/auth/training-login',()=>button(page,'登录').click())
  await page.waitForURL(student?/\/student(?:\?|$)/:/\/dashboard(?:\?|$)/)
}
async function adminLogin(page) {
  const cdp=await page.context().newCDPSession(page)
  await cdp.send('WebAuthn.enable')
  const {authenticatorId}=await cdp.send('WebAuthn.addVirtualAuthenticator',{options:{protocol:'ctap2',transport:'usb',hasResidentKey:false,hasUserVerification:true,isUserVerified:true,automaticPresenceSimulation:true}})
  await page.goto(fixture.trainingUrl+'/admin/security/enroll')
  await page.getByLabel('管理账号',{exact:true}).fill(fixture.administrator.username)
  await page.getByLabel('当前密码',{exact:true}).fill(fixture.administrator.password)
  await page.getByLabel('受控登记票据',{exact:true}).fill(fixture.administrator.enrollmentToken)
  await button(page,'登记安全密钥').click()
  await page.getByText('安全密钥已登记，请前往管理员登录。',{exact:true}).waitFor()
  assert.equal((await cdp.send('WebAuthn.getCredentials',{authenticatorId})).credentials.length,1)
  assert(!(await page.context().cookies()).some(cookie=>cookie.name==='ptool_session'))
  await page.goto(fixture.trainingUrl+'/admin/login')
  await page.locator('#auth-username').fill(fixture.administrator.username);await page.locator('#auth-password').fill(fixture.administrator.password)
  await button(page,'管理员登录').click();await page.waitForURL(/\/admin\/(entrances|permissions)$/)
  // System administration and Training entry authority are deliberately independent.
  // Use the real versioned authorization API, then reauthenticate after tokenVersion changes.
  const accounts=await api(page,'/api/admin/permissions/accounts?keyword='+encodeURIComponent(fixture.administrator.username),'GET',undefined,'MANAGEMENT')
  const account=accounts.accounts.find(row=>row.id===fixture.administrator.id);assert(account)
  const entry=account.entries.find(row=>row.entry==='TRAINING');assert(entry);assert.equal(entry.active,false)
  const granted=await api(page,'/api/admin/permissions/accounts/'+account.id+'/entries/TRAINING','PUT',{active:true,expectedVersion:entry.version,reason:'Disposable CI Training entry administrator prerequisite'},'MANAGEMENT')
  assert.equal(granted.active,true);assert.equal(granted.version,entry.version+1);assert.equal(granted.changed,true)
  await page.goto(fixture.trainingUrl+'/admin/login')
  await page.locator('#auth-username').fill(fixture.administrator.username);await page.locator('#auth-password').fill(fixture.administrator.password)
  await button(page,'管理员登录').click();await page.waitForURL(/\/admin\/(entrances|permissions)$/)
  const current=await api(page,'/api/auth/me','GET',undefined,'MANAGEMENT')
  assert.equal(current.id,fixture.administrator.id);assert.equal(current.platformRole,'SYSTEM_ADMIN');assert.equal(current.role,'ADMIN')
  assert(current.entryGrants.some(row=>row.entry==='TRAINING'))
  const confirmed=await api(page,'/api/admin/permissions/accounts?keyword='+encodeURIComponent(fixture.administrator.username),'GET',undefined,'MANAGEMENT')
  const confirmedEntry=confirmed.accounts.find(row=>row.id===account.id)?.entries.find(row=>row.entry==='TRAINING')
  assert.deepEqual(confirmedEntry,{entry:'TRAINING',active:true,version:granted.version})
  evidence.administratorEntry={entry:'TRAINING',explicitlyGranted:true,reauthenticated:true}
  check('real-virtual-ctap2-administrator-session')
}

function trainingDefinition(image,video) {
  return {schemaVersion:2,respondentType:'participant_self_report',source:{title:'Synthetic cross-entry author content'},license:{status:'self_authored',redistribution:'allowed',note:'Synthetic author permits controlled scale-bound sharing'},display:{randomizeItems:false},
    responseSets:[{key:'default',options:[{value:1,label:'数值一',score:1},{value:'1',label:'字符串一',score:2}]}],
    items:[{itemCode:'content',content:'Training typed scored content',purpose:'CONTENT',images:[{asset:image,altText:'Training question image',order:0}],video},{itemCode:'attention',content:'请选择字符串一',purpose:'ATTENTION_CHECK',attentionTarget:'1'},{itemCode:'social',content:'我从不撒谎',purpose:'SOCIAL_DESIRABILITY'}].map((item,sortOrder)=>({...item,type:'single',required:true,sortOrder,responseSetKey:'default',randomizeOptions:false})),
    scoring:{scoringVersion:'2.0.0',itemRules:[{itemCode:'content',transform:{type:'identity'}}],defaultMissingPolicy:{type:'complete_required'},scores:[{key:'total',type:'total',label:'总分',direction:'descriptive',canonical:true,displayPrecision:2,source:{type:'items',items:[{itemCode:'content',weight:1}],aggregation:'sum'}}]},
    report:{reportVersion:'2.0.0',primaryScoreKeys:['total'],scoreOrder:['total'],interpretations:[{scoreKey:'total',headline:'Total score',source:{type:'score_only'},summary:'Synthetic descriptive result',bands:[],guidance:[]}],limitations:[],disclaimer:'Synthetic descriptive feedback only',rawScoreFeedback:{schemaVersion:1,rules:[{scoreKey:'total',ranges:[{key:'synthetic',min:0,max:10,includeMax:true,text:'Synthetic workspace descriptive feedback',images:[]}]}]}},referencePolicy:{type:'none'}}
}
async function governedScale(author,admin){
 phase('real-native-scale-publication')
 const definition=trainingDefinition(undefined,undefined)
 definition.items=definition.items.slice(0,2);delete definition.items[0].images;delete definition.items[0].video
 const scale=await api(author,'/api/scales','POST',{code:'WS-'+fixture.runId,name:'Synthetic workspace granted scale',visibility:'COURSE',tags:[]})
 await api(author,`/api/scales/${scale.id}/definition`,'PUT',{definition})
 const current=await api(author,`/api/scales/${scale.id}`)
 const published=await api(author,`/api/scales/${scale.id}/publish`,'POST',{expectedUpdatedAt:current.updatedAt})
 const base=governance('TRAINING'),available=await api(author,base+'/sources/'+scale.id)
 const eligible=available.releases.filter(row=>row.eligible);assert.equal(eligible.length,1)
 const release=eligible[0];assert.equal(release.releaseId,published.measurementReleaseId)
 const manifest=await api(author,base+'/media-manifest','POST',{releaseId:release.releaseId,dependencyReleaseIds:[]})
 assert.equal(manifest.mediaManifest.items.length,0)
 const metadata={title:current.name,author:'Synthetic author',copyright:'Self authored synthetic content permitted for controlled use',applicability:'Isolated software acceptance only',scoringDescription:'Descriptive total excludes attention item',reportDescription:'Descriptive score only, not norms or diagnosis'}
 const submitted=await api(author,base+'/submissions','POST',{requestId:randomUUID(),releaseId:release.releaseId,metadata,dependencyReleaseIds:[],mediaConsent:{manifestHash:manifest.mediaManifest.manifestHash,shareWithAuthorizedUsers:true}})
 phase('real-review-and-exact-training-grant')
 const detail=await api(admin,base+'/submissions/'+submitted.id,'GET',undefined,'MANAGEMENT')
 assert.equal(detail.releaseId,release.releaseId);assert.equal(detail.release.contentHash,release.contentHash);assert.deepEqual(detail.snapshot.definition,current.definition)
 const approved=await api(admin,base+'/submissions/'+submitted.id+'/review','POST',{expectedVersion:detail.version,decision:'APPROVE',reason:'Checked exact synthetic definition, descriptive scorer and empty media manifest'},'MANAGEMENT')
 assert.equal(approved.status,'APPROVED');assert(approved.entryId)
 const grant=await api(admin,base+'/entries/'+approved.entryId+'/grants','POST',{requestId:randomUUID(),userId:fixture.teacher.id,product:'TRAINING'},'MANAGEMENT')
 assert.equal(grant.userId,fixture.teacher.id);assert.equal(grant.status,'ACTIVE')
 check('real-exact-publication-review-grant')
 return {entryId:approved.entryId,release,grant,name:current.name,definition:current.definition}
}
async function proof(page,name,target){
 const tools=path.resolve(__dirname,'../../.github/release-tools')
 assert.equal(require(path.join(tools,'node_modules/axe-core/package.json')).version,require(path.join(tools,'package.json')).dependencies['axe-core'])
 const axe=fs.readFileSync(path.join(tools,'node_modules/axe-core/axe.min.js'),'utf8')
 for(const width of [1440,390]){
  await page.setViewportSize({width,height:960});await page.evaluate(()=>document.fonts.ready)
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1)
  evidence.layoutChecks.push({name,width,overflow});assert.equal(overflow,false,'Horizontal overflow')
  if(target){let presses=0;while(!await target.evaluate(el=>document.activeElement===el)){assert(++presses<=100,'Keyboard target unreachable');await page.keyboard.press('Tab')}evidence.keyboard.push({name,width,tabPresses:presses,reached:true})}
  const file=name+'-'+width+'.png';await page.screenshot({path:path.join(output,file),fullPage:true,mask:[page.locator('input,textarea,code')]});evidence.screenshots.push({name,width,file})
  // Only the pinned local axe script is injected. Never intercept business API responses.
  const url=fixture.trainingUrl+'/__workspace_axe.js',route=r=>r.fulfill({contentType:'application/javascript',body:axe})
  await page.route(url,route);try{await page.addScriptTag({url})}finally{await page.unroute(url,route)}
  const audit=await page.evaluate(async()=>{const result=await window.axe.run({include:['main']},{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}});return {passes:result.passes.length,violations:result.violations.map(v=>({id:v.id,impact:v.impact,nodes:v.nodes.length,details:v.nodes.map(n=>({target:n.target.map(t=>String(t).replace(/\[[^\]]*\]/g,'[attribute]').replace(/[A-Za-z0-9_-]{24,}/g,'redacted').slice(0,200)),contrast:n.any.filter(c=>c.id==='color-contrast').map(c=>({foreground:c.data?.fgColor,background:c.data?.bgColor,ratio:c.data?.contrastRatio,expected:c.data?.expectedContrastRatio}))}))}))}})
  assert(audit.passes>0);evidence.accessibility.push({name,width,...audit});save();assert.deepEqual(audit.violations,[],'Accessibility violations')
 }
 await page.setViewportSize({width:1440,height:960})
}
async function toolkit(teacher,source){
 phase('teacher-toolkit-exact-readonly')
 const rows=await api(teacher,'/api/training-workspace/tools?kind=scale&source=granted&keyword='+encodeURIComponent(source.name))
 assert.equal(rows.total,1);const wrapper=rows.list[0]
 assert.equal(wrapper.canUpdateVersion,false);assert.equal(wrapper.source,'granted')
 const detail=await api(teacher,'/api/scales/'+wrapper.id)
 assert.equal(detail.libraryEntryId,source.entryId);assert.equal(detail.measurementReleaseId,source.release.releaseId);assert.deepEqual(detail.definition,source.definition)
 await teacher.goto(fixture.trainingUrl+'/toolkit?kind=scale&source=granted&keyword='+encodeURIComponent(source.name))
 const card=teacher.getByRole('article').filter({has:teacher.getByRole('heading',{name:source.name,exact:true})})
 const link=card.getByRole('link',{name:'查看与使用',exact:true});await link.waitFor()
 assert.equal(await button(card,'更新版本').count(),0);await proof(teacher,'toolkit-granted-scale',link)
 await link.click();await teacher.getByText('当前版本不可编辑',{exact:true}).waitFor()
 assert.equal(await button(teacher,'保存草稿').count(),0)
 await denied(teacher,'/api/scales/'+wrapper.id+'/definition','PUT',{definition:detail.definition})
 await denied(teacher,'/api/scales/'+wrapper.id+'/copy','POST',{})
 assert.deepEqual(await api(teacher,'/api/scales/'+wrapper.id),detail)
 check('toolkit-exact-readonly');return {wrapper,detail}
}
async function formCopy(author,admin,teacher){
 phase('real-authorized-form-copy')
 const base='/api/general-questionnaires'
 const form=await api(author,base,'POST',{code:'WF-'+fixture.runId,name:'Synthetic authorized workspace form'})
 await api(author,base+'/'+form.id+'/form-items','POST',{type:'text_input',label:'Synthetic feedback',required:true})
 await api(author,base+'/'+form.id+'/publish','POST',{})
 const before=await api(author,base+'/'+form.id)
 await api(admin,'/api/admin/material-grants','POST',{teacherId:fixture.teacher.id,resourceType:'FORM_TEMPLATE',resourceId:form.id},'MANAGEMENT')
 await teacher.goto(fixture.trainingUrl+'/toolkit?kind=form&source=granted&keyword='+encodeURIComponent(form.name))
 const card=teacher.getByRole('article').filter({has:teacher.getByRole('heading',{name:form.name,exact:true})})
 const copy=button(card,'复用为我的草稿');await copy.waitFor();assert.equal(await button(card,'更新版本').count(),0)
 await proof(teacher,'toolkit-authorized-form',copy)
 const copied=(await action(teacher,base+'/'+form.id+'/duplicate',()=>copy.click())).data
 assert.notEqual(copied.id,form.id);await teacher.waitForURL(new RegExp('/general-questionnaires/'+copied.id+'/edit$'))
 const detail=await api(teacher,base+'/'+copied.id)
 assert.equal(detail.creatorId,fixture.teacher.id);assert.equal(detail.status,'DRAFT');assert.equal(detail.visibility,'HIDDEN')
 assert.equal(detail._count.assessments,0);assert.deepEqual(detail.accessTokens,[])
 const tokens=await api(teacher,base+'/'+copied.id+'/tokens');assert.equal(tokens.total,0)
 await denied(teacher,base+'/'+form.id+'/tokens');await denied(teacher,base+'/'+form.id+'/anonymous-assessments')
 assert.deepEqual(await api(author,base+'/'+form.id),before)
 check('authorized-form-private-copy')
}
async function learnerJourney(teacher,admin,source,tool){
 phase('course-published-exact-library-unit')
 const base='/api/composite-assessments'
 const task=await api(teacher,base,'POST',{code:'WC-'+fixture.runId,name:'Synthetic workspace course assessment',courseId:fixture.courseId,publicEnabled:false,maxAttempts:1})
 await api(teacher,base+'/'+task.id+'/items','POST',{type:'SCALE',scaleId:tool.wrapper.id,required:true})
 const publication=await api(teacher,base+'/'+task.id+'/publish','POST',{});assert.equal(publication.status,'PUBLISHED')
 const student=await pageFor();await trainingLogin(student,fixture.student,true)
 const coursePath='/student/courses/'+fixture.courseId+'?section=assessments'
 await student.goto(fixture.trainingUrl+coursePath)
 const article=student.getByRole('article').filter({has:student.getByRole('heading',{name:task.name,exact:true})})
 const enter=article.locator('a[href*="/student/composite/'+task.id+'"]');await enter.waitFor()
 assert.equal(new URL(await enter.getAttribute('href'),fixture.trainingUrl).searchParams.get('courseId'),fixture.courseId)
 await proof(student,'learner-course',enter)
 const admitted=student.waitForResponse(r=>r.request().method()==='POST'&&new URL(r.url()).pathname===base+'/'+task.id+'/attempts').then(parsed)
 await enter.click();const {attempt}=await admitted,unit=attempt.currentItem
 assert.equal(attempt.deliveryMode,'FINAL_ONLY');assert.equal(unit.scale.id,tool.wrapper.id)
 assert.equal(unit.presentationMode,'ONE_BY_ONE');assert.equal(unit.definitionHash,tool.detail.definitionHash)
 assert.equal(unit.scale.definition.items.length,2)
 await student.getByRole('group',{name:unit.scale.definition.items[0].content,exact:true}).waitFor()
 assert.equal(await student.locator('[data-scale-presentation-mode="ALL_AT_ONCE"]').count(),0)
 evidence.frozen={publicationMode:'RUNNER_DEFAULT',runnerMode:'ONE_BY_ONE',releaseId:source.release.releaseId,contentHash:source.release.contentHash,definitionHash:unit.definitionHash,allAtOnceRequalified:false}
 check('student-course-frozen-native-mode')
 phase('nonmember-and-forged-course-hints')
 const stranger=await pageFor();await trainingLogin(stranger,fixture.stranger,true)
 const deniedAdmission=stranger.waitForResponse(r=>r.request().method()==='POST'&&new URL(r.url()).pathname===base+'/'+task.id+'/attempts')
 await stranger.goto(fixture.trainingUrl+'/student/composite/'+task.id+'?courseId='+fixture.courseId+'&courseSection=assessments')
 assert([403,404].includes((await deniedAdmission).status()));await stranger.getByText('暂时无法进入测评',{exact:true}).waitFor()
 assert.equal(await stranger.getByRole('group',{name:unit.scale.definition.items[0].content,exact:true}).count(),0)
 await denied(stranger,base+'/attempts/'+attempt.id+'/report?courseId='+fixture.courseId)
 await denied(student,'/api/courses/'+fixture.foreignCourseId)
 // Hints are navigation only: they cannot disclose a foreign course or another user's report.
 await student.goto(fixture.trainingUrl+'/student/composite/attempts/'+attempt.id+'?courseId='+fixture.foreignCourseId+'&courseSection=assessments')
 await student.getByRole('group',{name:unit.scale.definition.items[0].content,exact:true}).waitFor()
 const hinted=await api(student,base+'/attempts/'+attempt.id+'?courseId='+fixture.foreignCourseId)
 assert.equal(hinted.id,attempt.id);assert.equal(hinted.currentItem.definitionHash,unit.definitionHash)
 await student.goto(fixture.trainingUrl+'/student/composite/attempts/'+attempt.id+'?courseId='+fixture.courseId+'&courseSection=assessments')
 await student.getByRole('group',{name:unit.scale.definition.items[0].content,exact:true}).waitFor()
 check('forged-hint-and-nonmember-denied')
 phase('ordinary-revoke-versus-frozen-admission')
 const revoked=await api(admin,governance('TRAINING')+'/grants/'+source.grant.id+'/revoke','POST',{expectedVersion:source.grant.version,reason:'Synthetic ordinary revocation after real course admission'},'MANAGEMENT')
 assert.equal(revoked.status,'REVOKED')
 const after=await api(teacher,'/api/training-workspace/tools?kind=scale&source=granted&keyword='+encodeURIComponent(source.name));assert.equal(after.total,0)
 const fresh=await api(teacher,base,'POST',{code:'WN-'+fixture.runId,name:'Synthetic denied new use',courseId:fixture.courseId,publicEnabled:false,maxAttempts:1})
 await denied(teacher,base+'/'+fresh.id+'/items','POST',{type:'SCALE',scaleId:tool.wrapper.id,required:true})
 await teacher.goto(fixture.trainingUrl+'/toolkit?kind=scale&source=granted&keyword='+encodeURIComponent(source.name))
 await teacher.getByRole('heading',{name:'暂无符合条件的工具',exact:true}).waitFor()
 check('revoke-denies-new-use')
 phase('frozen-native-final-and-historical-report')
 const restored=await api(student,base+'/attempts/'+attempt.id)
 assert.equal(restored.currentItem.definitionHash,unit.definitionHash);assert.equal(restored.currentItem.presentationMode,'ONE_BY_ONE')
 const expected=[]
 for(const [index,item] of unit.scale.definition.items.entries()){
  const group=student.getByRole('group',{name:item.content,exact:true});await group.waitFor()
  const label=index===1?'字符串一':'数值一',choice=button(group,label),option=item.options.find(row=>row.label===label);assert(option)
  if(index===0)await proof(student,'learner-frozen-scale',choice)
  await choice.click();expected.push({itemCode:item.itemCode,responseValue:option.value})
  if(index+1<unit.scale.definition.items.length)await student.getByRole('group',{name:unit.scale.definition.items[index+1].content,exact:true}).waitFor()
  else await group.getByRole('button',{name:label,exact:true,pressed:true}).waitFor()
 }
 const final=(await action(student,base+'/attempts/'+attempt.id+'/items/'+unit.id+'/scale/submit',()=>button(student,'提交整份量表').click()))
 assert.deepEqual(final.request.postDataJSON().answers.map(({itemCode,responseValue})=>({itemCode,responseValue})),expected)
 const reportPath='/student/composite/attempts/'+attempt.id+'/report'
 await Promise.race([student.waitForURL(url=>url.pathname===reportPath),button(student,'查看本次结果').waitFor()])
 if(new URL(student.url()).pathname!==reportPath)await button(student,'查看本次结果').click()
 await student.waitForURL(url=>url.pathname===reportPath)
 const complete=await api(student,base+'/attempts/'+attempt.id);assert.equal(complete.status,'COMPLETED')
 await student.getByText('Synthetic workspace descriptive feedback',{exact:true}).waitFor()
 const report=await api(student,base+'/attempts/'+attempt.id+'/report')
 assert(Array.isArray(report.unitReports),'Expected parent unitReports')
 const result=report.unitReports.find(row=>row.type==='SCALE'&&row.scaleId===tool.wrapper.id);assert(result)
 assert(Array.isArray(result.scores),'Expected policy-projected scale scores')
 assert.deepEqual(result.scores.map(({key,value})=>({key,value})),[{key:'total',value:1}])
 await student.getByText('Synthetic workspace descriptive feedback',{exact:true}).waitFor()
 await proof(student,'learner-historical-report',button(student,'返回当前课程'))
 await student.reload();await student.getByText('Synthetic workspace descriptive feedback',{exact:true}).waitFor()
 const again=await api(student,base+'/attempts/'+attempt.id+'/report')
 assert.deepEqual(again.unitReports,report.unitReports)
 await button(student,'返回当前课程').click();await student.waitForURL(fixture.trainingUrl+coursePath)
 const history=student.getByRole('article').filter({has:student.getByRole('heading',{name:task.name,exact:true})}).locator('a[href*="'+reportPath+'"]')
 await history.first().waitFor();await history.first().click();await student.waitForURL(url=>url.pathname===reportPath)
 await student.getByText('Synthetic workspace descriptive feedback',{exact:true}).waitFor()
 await student.goBack();await student.waitForURL(fixture.trainingUrl+coursePath)
 await student.reload();await student.getByRole('heading',{name:task.name,exact:true}).waitFor()
 evidence.lifecycle={newUseDenied:true,existingFrozenCompleted:true,historicalReportReloaded:true,newCopyResponseCount:0,newCopyTokenCount:0,sourcePrivateEndpointsDenied:true}
 check('frozen-final-historical-report-back-reload')
}
function prerequisites(){
 assert.equal(process.env.GITHUB_ACTIONS,'true');assert.equal(process.env.NODE_ENV,'test');assert.equal(process.env.TRAINING_WORKSPACE_ISOLATED,'1')
 assert.equal(process.env.MEASUREMENT_BROWSER_EPHEMERAL_CA_APPROVED,'true','Separate ephemeral browser trust approval required')
 assert.match(process.env.GITHUB_SHA||'',/^[a-f0-9]{40}$/);assert.match(process.env.GITHUB_RUN_ID||'',/^\d+$/)
 const root=path.resolve(process.env.RUNNER_TEMP,'training-workspace-integrated-private'),file=path.resolve(process.env.TRAINING_WORKSPACE_FIXTURE_FILE||'')
 assert.equal(file,path.join(root,'fixture.json'))
 for(const name of [root,file]){const st=fs.lstatSync(name);assert(!st.isSymbolicLink());assert.equal(st.mode&0o077,0);assert.equal(fs.realpathSync(name),name)}
 fixture=JSON.parse(fs.readFileSync(file,'utf8'))
 assert.equal(fixture.isolated,true);assert.equal(fixture.sourceCommit,process.env.GITHUB_SHA);assert.equal(fixture.ciRunId,process.env.GITHUB_RUN_ID)
 assert.equal(fixture.trainingUrl,'https://training.eduk12.top')
 for(const actor of [fixture.author,fixture.teacher,fixture.student,fixture.stranger,fixture.administrator]){assert(actor.id&&actor.username&&actor.password)}
 assert.notEqual(fixture.author.id,fixture.teacher.id);assert(fixture.administrator.enrollmentToken)
 output=path.resolve(process.env.TRAINING_WORKSPACE_EVIDENCE_DIR||'');assert.equal(output,path.resolve(process.env.GITHUB_WORKSPACE,'training-workspace-integrated-evidence/browser'));fs.mkdirSync(output,{recursive:true})
 evidence.sourceCommit=fixture.sourceCommit;evidence.ciRunId=fixture.ciRunId
}
async function main(){
 try{
  prerequisites();save()
  const home=path.resolve(process.env.MEASUREMENT_BROWSER_PROFILE_HOME||'');assert(home.startsWith(path.dirname(process.env.TRAINING_WORKSPACE_FIXTURE_FILE)+path.sep));assert.equal(fs.realpathSync(home),home)
  const {chromium}=require(process.env.TRAINING_WORKSPACE_PLAYWRIGHT_MODULE)
  browser=await chromium.launch({headless:true,executablePath:process.env.TRAINING_WORKSPACE_CHROMIUM_EXECUTABLE||chromium.executablePath(),env:{...process.env,HOME:home},args:['--host-resolver-rules=MAP training.eduk12.top 127.0.0.1']})
  const author=await pageFor(),teacher=await pageFor(),admin=await pageFor()
  await trainingLogin(author,fixture.author);await trainingLogin(teacher,fixture.teacher);await adminLogin(admin)
  const source=await governedScale(author,admin),tool=await toolkit(teacher,source)
  await formCopy(author,admin,teacher);await learnerJourney(teacher,admin,source,tool)
  assert.deepEqual(evidence.checks,REQUIRED);assert.deepEqual(evidence.browserErrors,[]);assert.equal(evidence.blockedExternalRequests,0)
  evidence.status='PASS';phase('complete')
 }catch(error){
  evidence.status='FAIL';evidence.failure={phase:evidence.phase,name:error.name,code:'BOUNDED_BROWSER_ASSERTION_FAILED',frames:[...(error.stack||'').matchAll(/training-workspace-integration-browser\.cjs:(\d+):(\d+)/g)].slice(0,5).map(match=>({file:'training-workspace-integration-browser.cjs',line:Number(match[1]),column:Number(match[2])}))}
  // No exception message, body, HAR, cookies, credential values or failing login screenshot.
  process.exitCode=1
 }finally{if(browser)await browser.close();save()}
}
if(require.main===module)main().catch(()=>{process.exitCode=1})
module.exports={REQUIRED}
