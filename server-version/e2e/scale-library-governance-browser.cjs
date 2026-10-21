/** Real isolated governance smoke. Author API composition is intentional: the
 * visual editor does not claim item-video authoring. Review and participant
 * consumption use the production UI. No fixture publications, READY assets,
 * sessions, response mocks, certificate bypass or local execution. */
'use strict'
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const {createHash, randomUUID} = require('node:crypto')
const {execFileSync} = require('node:child_process')
const {totpAt, assertRenderedSurveyImage, redactDiagnostics} = require('./scale-authoring-feedback-browser.cjs')
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAIAAACQkWg2AAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAGUlEQVQokWOwyZtGEmIY1ZA3Gko2wzVpAADFt0AQijuzMgAAAABJRU5ErkJggg==', 'base64')
const pngHash = createHash('sha256').update(png).digest('hex')
let fixture, output, browser, activePage
const secrets = new Set()
const evidence = {schemaVersion:1,status:'RUNNING',phase:'prerequisites',checks:[],screenshots:[],layoutChecks:[],accessibility:[],browserErrors:[],failedRequests:[],media:[],mediaResponses:[],journeys:[],blockedExternalRequests:0,authoring:'Real authenticated author API; production UI review and participant consumption',physicalSecurityKeyVerified:false}
const clean = value => {
  if (Array.isArray(value)) return value.map(clean)
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key,item])=>[key,/password|token|credential|secret|cookie/i.test(key)?'[redacted]':clean(item)]))
  if (typeof value !== 'string') return value
  let text = redactDiagnostics(value).replace(/\b[A-Za-z0-9_-]{43}\b/g,'[redacted-opaque-proof]')
  for (const secret of secrets) if (secret) text = text.split(secret).join('[redacted]')
  return text
}
const save = () => { if (output) fs.writeFileSync(path.join(output,'result.json'),JSON.stringify(clean(evidence),null,2)) }
const phase = name => { evidence.phase=name; save() }
const check = (name, condition=true) => { assert(condition,name); evidence.checks.push(name); save() }
const button = (page,name) => page.getByRole('button',{name,exact:true})
const governance = product => '/api/'+product.toLowerCase()+'/scale-library-governance'
async function parsed(response) {
  let body; try { body=await response.json() } catch { body=null }
  if (!response.ok() || body?.code!==0) throw new Error(JSON.stringify(clean({phase:evidence.phase,status:response.status(),method:response.request().method(),pathname:new URL(response.url()).pathname,code:body?.code,message:body?.message,issues:body?.data?.issues})))
  return body.data
}
async function action(page, endpoint, trigger, method='POST') {
  activePage=page
  const [response]=await Promise.all([page.waitForResponse(r=>r.request().method()===method&&(endpoint instanceof RegExp?endpoint.test(new URL(r.url()).pathname):new URL(r.url()).pathname===endpoint)),trigger()])
  return {data:await parsed(response),request:response.request()}
}
async function api(page, endpoint, method='GET', body, view='BUSINESS') {
  activePage=page
  const result=await page.evaluate(async ({endpoint,method,body,view})=>{
    const survey=location.hostname==='survey.eduk12.top'
    const headers={'Content-Type':'application/json',...(!survey?{'X-EduK12-Account-View':view}:{})}
    if(method!=='GET') {
      const csrf=await fetch(survey?'/api/survey/auth/csrf':'/api/auth/csrf',{credentials:'same-origin',headers:!survey?{'X-EduK12-Account-View':view}:{}})
      const envelope=await csrf.json(); if(!csrf.ok||envelope.code!==0)throw new Error('CSRF acquisition rejected')
      headers['X-CSRF-Token']=envelope.data.csrfToken
    }
    const response=await fetch(endpoint,{method,credentials:'same-origin',headers,...(body===undefined?{}:{body:JSON.stringify(body)})})
    let value;try{value=await response.json()}catch{value=null}
    return {status:response.status,body:value}
  },{endpoint,method,body,view})
  if(result.status<200||result.status>=300||result.body?.code!==0)throw new Error(JSON.stringify(clean({phase:evidence.phase,endpoint,method,status:result.status,code:result.body?.code,message:result.body?.message,issues:result.body?.data?.issues})))
  return result.body.data
}
async function pageFor() {
  const context=await browser.newContext({viewport:{width:1440,height:1000},locale:'zh-CN',timezoneId:'UTC',acceptDownloads:true,serviceWorkers:'block'})
  await context.route('**/*',route=>{const url=new URL(route.request().url());if(!['http:','https:'].includes(url.protocol)||[fixture.trainingUrl,fixture.surveyUrl].includes(url.origin))return route.continue();evidence.blockedExternalRequests++;return route.abort('blockedbyclient')})
  const page=await context.newPage();activePage=page;page.setDefaultTimeout(25000)
  page.on('pageerror',error=>evidence.browserErrors.push(clean({name:error.name,message:error.message})))
  page.on('requestfailed',request=>{if(evidence.failedRequests.length<20)evidence.failedRequests.push(clean({phase:evidence.phase,method:request.method(),pathname:new URL(request.url()).pathname,message:request.failure()?.errorText}))})
  page.on('response',response=>{const pathname=new URL(response.url()).pathname;if(/\/(?:assets|report-images|assessment-media)\//.test(pathname)&&evidence.mediaResponses.length<60){const headers=response.headers();evidence.mediaResponses.push({phase:evidence.phase,method:response.request().method(),status:response.status(),contentType:headers['content-type']??null,contentLength:headers['content-length']??null})}})
  return page
}
async function trainingLogin(page,actor,student=false) {
  await page.goto(fixture.trainingUrl+(student?'/student/login':'/teacher/account-login'))
  await page.locator('#auth-username').fill(actor.username);await page.locator('#auth-password').fill(actor.password)
  await action(page,'/api/auth/training-login',()=>button(page,'登录').click())
  await page.waitForURL(student?/\/student(?:\?|$)/:/\/dashboard(?:\?|$)/)
}
async function surveyLogin(page) {
  await page.goto(fixture.surveyUrl+'/login')
  await page.getByLabel('研究者登录名',{exact:true}).fill(fixture.researcher.username)
  await page.getByLabel('密码',{exact:true}).fill(fixture.researcher.password)
  await button(page,'进入双因素验证').click()
  const otp=totpAt(fixture.researcher.totpSecretBase64);secrets.add(otp.code)
  await page.getByLabel('动态验证码／恢复码',{exact:true}).fill(otp.code)
  await button(page,'验证并登录').click();await page.getByRole('heading',{name:'我的研究',exact:true}).waitFor()
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
  check('real-virtual-ctap2-administrator-session')
}
async function renderedImage(locator,hash) {
  assert.equal(await locator.count(),1)
  await locator.waitFor();await locator.scrollIntoViewIfNeeded()
  await locator.evaluate(img=>new Promise((resolve,reject)=>{if(img.complete)return img.naturalWidth?resolve():reject(new Error('Image decode failed'));const timer=setTimeout(()=>reject(new Error('Image decode timed out')),10000);img.addEventListener('load',()=>{clearTimeout(timer);resolve()},{once:true});img.addEventListener('error',()=>{clearTimeout(timer);reject(new Error('Image decode failed'))},{once:true})}))
  const result=await locator.evaluate(async img=>{
    if(!img.currentSrc.startsWith('blob:')||img.src!==img.currentSrc||new URL(img.currentSrc).origin!==location.origin)throw new Error('Expected the actual same-origin API image Blob')
    const blob=await(await fetch(img.currentSrc)).blob(),bytes=new Uint8Array(await blob.arrayBuffer()),digest=new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))
    return {sourceKind:'blob',complete:img.complete,naturalWidth:img.naturalWidth,naturalHeight:img.naturalHeight,byteLength:bytes.length,contentType:blob.type,signature:[...bytes.slice(0,8)],sha256:[...digest].map(x=>x.toString(16).padStart(2,'0')).join('')}
  })
  assertRenderedSurveyImage(result,hash);return result
}
async function videoRange(locator) {
  assert.equal(await locator.count(),1)
  const result=await locator.evaluate(async video=>{
    const source=new URL(video.currentSrc||video.src,location.href)
    if(source.origin!==location.origin||!source.pathname.startsWith('/api/assets/'))throw new Error('Video must use actual scoped asset capability')
    const response=await fetch(source.href,{headers:{Range:'bytes=0-1023'},credentials:'same-origin'})
    const bytes=new Uint8Array(await response.arrayBuffer())
    await video.play()
    await new Promise((resolve,reject)=>{const deadline=setTimeout(()=>reject(new Error('Actual video playback did not advance')),10000);const tick=()=>{if(video.currentTime>0){clearTimeout(deadline);video.removeEventListener('timeupdate',tick);video.pause();resolve()}};video.addEventListener('timeupdate',tick);tick()})
    return {status:response.status,contentType:response.headers.get('content-type'),contentRange:response.headers.get('content-range'),byteLength:bytes.length,currentTime:video.currentTime,videoWidth:video.videoWidth,videoHeight:video.videoHeight}
  })
  assert.equal(result.status,206);assert.match(result.contentRange,/^bytes 0-1023\/\d+$/);assert.equal(result.byteLength,1024);assert.match(result.contentType,/^video\//);assert(result.currentTime>0&&result.videoWidth>0&&result.videoHeight>0)
  return result
}
async function upload(page,endpoint,field,name,mime,bytes,extraFields={}) {
  for(const [key,value] of Object.entries(extraFields)){assert(key!==field);assert.equal(typeof value,'string')}
  const result=await page.evaluate(async({endpoint,field,name,mime,base64,extraFields})=>{
    const survey=location.hostname==='survey.eduk12.top'
    const csrf=await(await fetch(survey?'/api/survey/auth/csrf':'/api/auth/csrf',{credentials:'same-origin'})).json()
    if(csrf.code!==0)throw new Error('Upload CSRF acquisition rejected')
    const data=new FormData();data.append(field,new Blob([Uint8Array.from(atob(base64),x=>x.charCodeAt(0))],{type:mime}),name)
    for(const [key,value] of Object.entries(extraFields))data.append(key,value)
    const response=await fetch(endpoint,{method:'POST',credentials:'same-origin',headers:{'X-CSRF-Token':csrf.data.csrfToken,...(!survey?{'X-EduK12-Account-View':'BUSINESS'}:{})},body:data})
    return {status:response.status,body:await response.json()}
  },{endpoint,field,name,mime,base64:bytes.toString('base64'),extraFields})
  assert(result.status>=200&&result.status<300&&result.body.code===0,JSON.stringify(clean({status:result.status,code:result.body.code,message:result.body.message})))
  return result.body.data
}
async function processedVideo(author) {
  const file=process.env.SCALE_GOVERNANCE_VIDEO_FILE
  assert.equal(path.resolve(file),path.join(path.dirname(process.env.SCALE_GOVERNANCE_FIXTURE_FILE),'synthetic.mp4'))
  const bytes=fs.readFileSync(file);assert(bytes.length>1024&&bytes.length<2*1024*1024)
  const uploaded=await upload(author,'/api/videos/upload','video','synthetic.mp4','video/mp4',bytes,{title:'Synthetic governance media'})
  assert(uploaded.id&&uploaded.originalAssetId)
  const deadline=Date.now()+150000
  let state
  do {
    state=await api(author,`/api/videos/${uploaded.id}/status`)
    assert.notEqual(state.status,'FAILED','Real isolated worker failed; no fake READY fallback')
    if(state.status==='COMPLETED')break
    assert(Date.now()<deadline,'Real isolated worker did not complete within bounded processing budget')
    await new Promise(resolve=>setTimeout(resolve,1500))
  } while(true)
  const listed=await api(author,'/api/videos?page=1&pageSize=20')
  const video=listed.list.find(row=>row.id===uploaded.id);assert(video?.processedAssetId&&video.processedUrl)
  const identity=await author.evaluate(async url=>{
    const actual=new URL(url,location.href);if(actual.origin!==location.origin)throw new Error('Only actual isolated same-origin processed bytes allowed')
    const response=await fetch(actual.href,{credentials:'same-origin'});if(!response.ok)throw new Error('Processed video cannot be read')
    const data=await response.arrayBuffer(),hash=new Uint8Array(await crypto.subtle.digest('SHA-256',data))
    return {contentHash:[...hash].map(x=>x.toString(16).padStart(2,'0')).join(''),mimeType:response.headers.get('content-type').split(';')[0],sizeBytes:data.byteLength}
  },video.processedUrl)
  assert(identity.sizeBytes>1024);assert.match(identity.mimeType,/^video\//)
  evidence.media.push({name:'real-video-worker',status:state.status,originalUploadSha256:createHash('sha256').update(bytes).digest('hex'),processedSha256:identity.contentHash,processedBytes:identity.sizeBytes})
  check('real-upload-worker-completed')
  return {assetId:video.processedAssetId,contentHash:identity.contentHash,mimeType:identity.mimeType}
}
const feedback = (scoreKey,image,label) => ({schemaVersion:1,rules:[{scoreKey,ranges:[{key:'synthetic',min:0,max:10,includeMax:true,text:label,images:[{asset:image,altText:label+' image',order:0}]}]}]})
function trainingDefinition(image,video) {
  return {schemaVersion:2,respondentType:'participant_self_report',source:{title:'Synthetic cross-entry author content'},license:{status:'self_authored',redistribution:'allowed',note:'Synthetic author permits controlled scale-bound sharing'},display:{randomizeItems:false},
    responseSets:[{key:'default',options:[{value:1,label:'数值一',score:1},{value:'1',label:'字符串一',score:2}]}],
    items:[{itemCode:'content',content:'Training typed scored content',purpose:'CONTENT',images:[{asset:image,altText:'Training question image',order:0}],video},{itemCode:'attention',content:'请选择字符串一',purpose:'ATTENTION_CHECK',attentionTarget:'1'},{itemCode:'social',content:'我从不撒谎',purpose:'SOCIAL_DESIRABILITY'}].map((item,sortOrder)=>({...item,type:'single',required:true,sortOrder,responseSetKey:'default',randomizeOptions:false})),
    scoring:{scoringVersion:'2.0.0',itemRules:[{itemCode:'content',transform:{type:'identity'}}],defaultMissingPolicy:{type:'complete_required'},scores:[{key:'total',type:'total',label:'总分',direction:'descriptive',canonical:true,displayPrecision:2,source:{type:'items',items:[{itemCode:'content',weight:1}],aggregation:'sum'}}]},
    report:{reportVersion:'2.0.0',primaryScoreKeys:['total'],scoreOrder:['total'],interpretations:[{scoreKey:'total',headline:'Total score',source:{type:'score_only'},summary:'Synthetic descriptive result',bands:[],guidance:[]}],limitations:[],disclaimer:'Synthetic descriptive feedback only',rawScoreFeedback:feedback('total',image,'TRAINING LIBRARY FEEDBACK')},referencePolicy:{type:'none'}}
}
async function authorTraining(author) {
  phase('training-api-authoring')
  const uploaded=await upload(author,'/api/uploads/image','image','synthetic.png','image/png',png)
  const image={assetId:uploaded.assetId,contentHash:uploaded.contentHash,mimeType:uploaded.mimeType};assert.equal(image.contentHash,pngHash)
  const video=await processedVideo(author)
  const definition=trainingDefinition(image,{schemaVersion:1,video,title:'Synthetic two-second video',transcript:{language:'zh-CN',text:'合成纯色视频，无实际个人资料。'}})
  const scale=await api(author,'/api/scales','POST',{code:'LIBRARY-CI-'+fixture.runId,name:'Synthetic Training library scale',visibility:'COURSE',tags:[]})
  await api(author,`/api/scales/${scale.id}/definition`,'PUT',{definition})
  const current=await api(author,`/api/scales/${scale.id}`)
  await api(author,`/api/scales/${scale.id}/publish`,'POST',{expectedUpdatedAt:current.updatedAt})
  return {sourceId:scale.id,title:current.name,definition:current.definition,image,video,product:'TRAINING'}
}
async function applyForLibrary(author,source) {
  phase(source.product.toLowerCase()+'-exact-library-application')
  const base=governance(source.product),available=await api(author,base+'/sources/'+source.sourceId)
  const eligible=available.releases.filter(row=>row.eligible);assert.equal(eligible.length,1)
  const release=eligible[0];assert(release.releaseId&&release.contentHash&&release.mediaManifest?.manifestHash)
  const manifest=await api(author,base+'/media-manifest','POST',{releaseId:release.releaseId,dependencyReleaseIds:[]})
  assert.deepEqual(manifest.mediaManifest,release.mediaManifest)
  const metadata={title:source.title,author:'Synthetic test author',copyright:'Self-authored synthetic content, authorized scale-bound media sharing',applicability:'Isolated software test only',scoringDescription:'Raw descriptive score; attention and social desirability answers are excluded',reportDescription:'Exact frozen descriptive text and synthetic image; no norms or diagnosis'}
  const submission=await api(author,base+'/submissions','POST',{requestId:randomUUID(),releaseId:release.releaseId,metadata,dependencyReleaseIds:[],mediaConsent:{manifestHash:manifest.mediaManifest.manifestHash,shareWithAuthorizedUsers:true}})
  assert.equal(submission.status,'SUBMITTED');assert.equal(submission.releaseId,release.releaseId)
  return {...source,release,manifest:manifest.mediaManifest,submission}
}
async function reviewAndGrant(admin,source,product,recipient) {
  phase(source.product.toLowerCase()+'-ui-review-'+product.toLowerCase())
  await admin.goto(fixture.trainingUrl+'/admin/scale-library-governance')
  await admin.getByRole('heading',{name:'公共量表库与授权治理',exact:true}).waitFor()
  const article=admin.locator('article').filter({has:admin.getByRole('heading',{level:3,name:source.title+' · 待审核',exact:true})})
  const detail=await action(admin,governance('TRAINING')+'/submissions/'+source.submission.id,()=>button(article,'读取精确版本审核内容').click(),'GET')
  assert.equal(detail.data.releaseId,source.release.releaseId);assert.equal(detail.data.release.contentHash,source.release.contentHash)
  assert.deepEqual(detail.data.mediaManifest,source.manifest)
  const snapshot=JSON.parse(await article.locator('details pre').innerText());assert.deepEqual(snapshot,detail.data)
  assert.deepEqual(snapshot.snapshot.definition,source.definition)
  for(const item of source.manifest.items) {
    const media=article.getByRole('region',{name:'固定附件审核清单'}).locator('article').filter({hasText:item.assetId})
    if(item.mimeType.startsWith('image/')) {
      await button(media,'预览附件图片').click()
      evidence.media.push({name:'review-image',...(await renderedImage(media.getByAltText('审核附件 '+item.assetId,{exact:true}),item.contentHash))})
    } else if(item.mimeType.startsWith('video/')) {
      const issued=await action(admin,governance('TRAINING')+'/submissions/'+source.submission.id+'/media/'+item.assetId+'/capability',()=>button(media,'授权预览视频').click(),'GET')
      const ttl=new Date(issued.data.expiresAt).getTime()-Date.now();assert(ttl>0&&ttl<=60000)
      evidence.media.push({name:'review-video',capabilityMaxSeconds:60,...await videoRange(media.getByLabel('审核视频 '+item.assetId,{exact:true}))})
    } else assert.fail('Unreviewed manifest media type')
  }
  await article.getByRole('checkbox',{name:'已核对固定附件内容及随量表共享权限',exact:true}).check()
  await admin.getByRole('textbox',{name:/^审核、下架或撤权说明/}).fill('Verified frozen synthetic content, score exclusions, exact attachments and controlled sharing rights')
  const approved=await action(admin,governance('TRAINING')+'/submissions/'+source.submission.id+'/review',()=>button(article,'批准精确版本入库').click())
  assert.equal(approved.data.status,'APPROVED')
  await admin.getByRole('status').filter({hasText:'已批准收录，尚未自动分配使用权限。'}).waitFor()
  const entries=await api(admin,governance('TRAINING')+'/entries','GET',undefined,'MANAGEMENT')
  const entry=entries.list.find(row=>row.submissionId===source.submission.id);assert(entry&&entry.status==='ACTIVE');assert.equal(entry.releaseId,source.release.releaseId)
  const row=admin.locator('article').filter({has:admin.getByRole('heading',{level:3,name:source.title+' · 自编描述性量表 · 已收录',exact:true})})
  for(let page=1;await row.count()===0;page++) {
    assert(page<20,'Approved entry not found in bounded catalog')
    const next=admin.getByRole('button',{name:'目录下一页',exact:true,disabled:false})
    await next.waitFor()
    await action(admin,governance('TRAINING')+'/catalog',()=>next.click(),'GET')
    await admin.getByRole('button',{name:'刷新状态',exact:true,disabled:false}).waitFor()
  }
  await button(row,'查看 / 分配只读使用权限').click()
  const grants=admin.getByRole('region',{name:'精确版本使用授权',exact:true})
  await grants.getByRole('combobox',{name:/^目标入口/}).selectOption(product)
  await grants.getByLabel('查找授权账号',{exact:true}).fill(recipient.username)
  await button(grants,'读取可见授权对象').click()
  await grants.getByRole('combobox',{name:/^授权对象/}).locator('option[value="'+recipient.id+'"]').waitFor({state:'attached'})
  await grants.getByRole('combobox',{name:/^授权对象/}).selectOption(recipient.id)
  const grant=await action(admin,governance('TRAINING')+'/entries/'+entry.id+'/grants',()=>button(grants,'授予所选账号只读使用').click())
  assert.equal(grant.data.userId,recipient.id);assert.equal(grant.data.product,product);assert.equal(grant.data.status,'ACTIVE')
  check(source.product.toLowerCase()+'-approved-and-granted-'+product.toLowerCase())
  return {...source,compiledDefinition:detail.data.snapshot.compiledDefinition,entry,grant:grant.data}
}
async function authorSurvey(author) {
  phase('survey-native-api-authoring')
  const base='/api/survey/projects/'+fixture.project.id
  const uploaded=await upload(author,base+'/assets','image','synthetic.png','image/png',png)
  const image={assetId:uploaded.assetId,contentHash:uploaded.contentHash,mimeType:uploaded.mimeType};assert.equal(image.contentHash,pngHash)
  const definition={schemaVersion:1,presentationMode:'ALL_AT_ONCE',respondentType:'participant_self_report',aggregation:'sum',responseOptions:[{optionKey:'one',label:'Survey 一分',score:1},{optionKey:'two',label:'Survey 二分',score:2}],dimensions:[{dimensionKey:'total',label:'总分',direction:'descriptive'}],items:[{itemKey:'content',prompt:'Survey native scored content',purpose:'CONTENT',dimensionKeys:['total']},{itemKey:'attention',prompt:'请选择 Survey 二分',purpose:'ATTENTION_CHECK',attentionTarget:'two',dimensionKeys:[]},{itemKey:'social',prompt:'我从不撒谎',purpose:'SOCIAL_DESIRABILITY',dimensionKeys:[]}].map(item=>({...item,required:true,reverse:false})),rawScoreFeedback:feedback('total',image,'SURVEY LIBRARY FEEDBACK')}
  const draft=await api(author,base+'/instruments','POST',{requestId:randomUUID(),kind:'SCALE',instrumentKey:'survey_library_native',title:'Synthetic Survey library scale'})
  const saved=await api(author,base+'/instruments/'+draft.id,'PATCH',{revision:draft.revision,title:draft.title,definition})
  const released=await api(author,base+'/instruments/'+draft.id+'/measurement-release','POST',{revision:saved.revision})
  assert(released.releaseId&&released.contentHash);assert.equal(released.version,'v'+saved.authoringVersion)
  return {sourceId:draft.id,title:draft.title,definition:saved.definition,image,product:'SURVEY'}
}
async function importAndFreeze(author,source) {
  phase('survey-readonly-import-and-explicit-publication')
  const base='/api/survey/projects/'+fixture.project.id
  const catalog=await api(author,base+'/catalog?page=1')
  const grant=catalog.list.find(row=>row.sourceRef.sourceId==='library:'+source.entry.id);assert(grant)
  assert.equal(grant.sourceRef.sourceVersion,source.release.version)
  const imported=await api(author,base+'/catalog/'+grant.id+'/import','POST',{requestId:randomUUID(),instrumentKey:'training_library_import',title:'Imported Training library scale'})
  assert.equal(imported.readOnly,true)
  const release=await api(author,base+'/instruments/'+imported.id+'/measurement-release','POST',{revision:imported.revision})
  assert.equal(imported.sourceProvenance.sourceMeasurementRelease.releaseId,source.release.releaseId)
  assert.equal(imported.sourceProvenance.sourceMeasurementRelease.contentHash,source.release.contentHash)
  assert(release.releaseId&&release.contentHash&&release.measurementHash)
  const wave=await api(author,base+'/waves','POST',{requestId:randomUUID(),title:'Synthetic controlled shared-scale wave',consentText:'Synthetic software test only. Participation is voluntary, withdrawal is available. No personal data. Descriptive feedback is not a diagnosis.',generalText:'Synthetic completion',instrumentIds:[imported.id]})
  const waveBase=base+'/waves/'+wave.id
  const preflight=await api(author,waveBase+'/preflight','POST',{})
  assert(preflight.ok,JSON.stringify(clean(preflight.checks)))
  const prepared=await api(author,waveBase+'/prepare','POST',{revision:wave.revision,contentSelections:[],participantFeedback:[{instrumentId:imported.id,feedback:{policyVersion:'SURVEY_RAW_METRICS_V1',mode:'DESCRIPTIVE',metricKeys:release.metricKeys,release:'AFTER_FINAL'}}]})
  assert(prepared.runtimeReady&&prepared.publicationId&&prepared.digest)
  const fresh=await api(author,waveBase)
  const frozen=fresh.frozenContentSelections.find(row=>row.draftId===imported.id);assert(frozen)
  assert.equal(frozen.measurementRelease.releaseId,release.releaseId);assert.equal(frozen.measurementRelease.contentHash,release.contentHash)
  const opened=await api(author,waveBase+'/open','POST',{revision:fresh.revision})
  const url=new URL(opened.researchUrl);assert.equal(url.origin,fixture.surveyUrl);assert(url.hash)
  check('training-to-survey-readonly-exact-release-frozen')
  return {imported,release,wave,waveBase,url}
}
async function surveyParticipant(shared,source) {
  phase('survey-participant-original-scorer-and-media')
  const page=await pageFor();await page.goto(shared.url.href)
  await button(page,'选择本轮').click()
  await page.getByRole('checkbox',{name:/我已阅读并同意本轮研究说明/}).check()
  const runtimeCapability=page.waitForResponse(r=>r.request().method()==='POST'&&new URL(r.url()).pathname.endsWith('/video-capabilities')).then(parsed)
  const task=await action(page,/\/api\/public\/survey\/r\/[^/]+\/attempts\/[^/]+\/task$/,()=>button(page,'开始或恢复本轮作答').click())
  const unit=task.data.units.find(row=>row.instrumentKey===shared.imported.instrumentKey);assert(unit)
  assert(!JSON.stringify(task.data).includes('attentionTarget'))
  assert.equal(unit.items.length,3)
  const expected={}
  for(const [index,item] of unit.items.entries()) {
    const options=item.responseOptions??unit.responseOptions
    const wanted=options.find(option=>option.label===(index===1?'字符串一':'数值一'));assert(wanted)
    const field=page.getByRole('group',{name:item.prompt+' *',exact:true})
    if(item.images?.length) {
      for(const image of item.images)evidence.media.push({name:'survey-question-image',...await renderedImage(field.getByAltText(image.altText,{exact:true}),source.image.contentHash)})
    }
    if(item.video) {
      const capability=await runtimeCapability
      const ttl=capability.expiresAt-Math.floor(Date.now()/1000);assert(ttl>0&&ttl<=600)
      const video=field.locator('video');await video.waitFor()
      const played={name:'survey-runtime-video',capabilityMaxSeconds:600,...await videoRange(video)}
      // Continue the real player through the end; never inject viewing state,
      // seek, alter playbackRate, or dispatch a synthetic ended event.
      await video.evaluate(async element=>{await element.play();if(!element.ended)await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('Full video viewing incomplete')),10000);element.addEventListener('ended',()=>{clearTimeout(timer);resolve()},{once:true})})})
      const ended=await video.evaluate(element=>element.ended);assert.equal(ended,true);evidence.media.push({...played,ended})
    }
    await field.getByRole('radio',{name:wanted.label,exact:true}).check()
    expected[item.itemKey]=wanted.optionKey
    if(unit.presentationMode==='ONE_BY_ONE'&&index<unit.items.length-1)await button(page,'下一题').click()
  }
  const general=page.waitForResponse(r=>r.request().method()==='POST'&&/\/api\/public\/survey\/r\/[^/]+\/attempts\/[^/]+\/general$/.test(new URL(r.url()).pathname)).then(parsed)
  const [final,receipt]=await Promise.all([action(page,/\/api\/public\/survey\/r\/[^/]+\/attempts\/[^/]+\/final$/,()=>button(page,'提交本轮正式回答').click()),general])
  assert.equal(final.data.status,'COMPLETED');assert.deepEqual(final.request.postDataJSON().answers,{[unit.instrumentKey]:expected})
  const measurement=receipt.measurements.find(row=>row.instrumentKey===unit.instrumentKey);assert(measurement)
  assert.equal(measurement.measurementReleaseId,shared.release.releaseId)
  const scoreImage=process.env.SCALE_GOVERNANCE_SCORE_IMAGE
  assert.equal(process.env.SCALE_GOVERNANCE_BACKEND_IMAGE_HEAD,'c2c383fd4f61d09b91d61ae16eaec9f5c7c0db22')
  assert.equal(scoreImage,'scale-library-governance-backend-runtime:'+process.env.SCALE_GOVERNANCE_BACKEND_IMAGE_HEAD)
  const canonical=JSON.parse(execFileSync('docker',['run','--rm','--name','scale-governance-score-'+process.env.GITHUB_RUN_ID,'--label','scale-governance-ci='+process.env.GITHUB_RUN_ID,'--network','none','--cpus=1','--memory=256m','-i',scoreImage,'node','-e',
    "let text='';process.stdin.on('data',chunk=>text+=chunk);process.stdin.on('end',()=>{const input=JSON.parse(text);process.stdout.write(JSON.stringify(require('/app/dist/modules/scale/scale-scoring.js').scoreScale(input.definition,input.answers)))})"],
    {input:JSON.stringify({definition:source.compiledDefinition,answers:{content:1,attention:'1',social:1}}),encoding:'utf8',timeout:15000,maxBuffer:1024*1024}))
  assert.deepEqual(measurement.metrics.map(({key,value})=>({key,value})),canonical.scores.map(({key,value})=>({key,value})))
  assert.equal(measurement.metrics[0].value,1)
  await page.getByText('TRAINING LIBRARY FEEDBACK',{exact:true}).waitFor()
  evidence.media.push({name:'survey-frozen-report-image',...await renderedImage(page.getByAltText('TRAINING LIBRARY FEEDBACK image',{exact:true}),source.image.contentHash)})
  evidence.journeys.push({name:'training-to-survey',finalAnswerCount:3,typedAnswersPreserved:true,contentScore:1,qualityItemsExcluded:2,exactApprovedRelease:true,reportImageExact:true})
  check('training-to-survey-final-original-scorer-media')
  return {page,task,final,receipt}
}
async function captureAndAudit(page,name) {
  activePage=page
  for(const width of [1440,390]) {
    await page.setViewportSize({width,height:1000});await page.evaluate(()=>document.fonts.ready)
    const file=name+'-'+width+'.png'
    await page.screenshot({path:path.join(output,file),fullPage:true,mask:[page.locator('input,textarea,code,[href*="/r/"]')]})
    evidence.screenshots.push({name,width,file})
    evidence.layoutChecks.push({name,width,overflow:await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1)})
  }
  await page.setViewportSize({width:1440,height:1000})
  assert(await page.locator('script[type=module][src*="/assets/"]').count()>0)
  assert.equal(await page.locator('script[src*="/@vite/client"]').count(),0)
  const toolsRoot=path.resolve(__dirname,'../../.github/release-tools')
  const version=require(path.join(toolsRoot,'node_modules/axe-core/package.json')).version
  assert.equal(version,require(path.join(toolsRoot,'package.json')).dependencies['axe-core'])
  const source=fs.readFileSync(path.join(toolsRoot,'node_modules/axe-core/axe.min.js'),'utf8')
  const toolUrl=new URL('/governance-ci-axe.js',page.url()).href
  const route=interception=>interception.fulfill({contentType:'application/javascript',body:source})
  await page.route(toolUrl,route)
  try{await page.addScriptTag({url:toolUrl})}finally{await page.unroute(toolUrl,route)}
  const audit=await page.evaluate(async()=>{const result=await window.axe.run({include:['main']},{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}});return{passes:result.passes.length,violations:result.violations}})
  assert(audit.passes>0);evidence.accessibility.push({name,...clean(audit)});save()
}
async function catalogIdentity(admin,sources) {
  phase('unified-standard-and-authored-catalog')
  const first=await api(admin,governance('TRAINING')+'/catalog?page=1&pageSize=1','GET',undefined,'MANAGEMENT')
  assert.equal(first.page,1);assert.equal(first.pageSize,1);assert.equal(first.list.length,1);assert.equal(first.hasMore,true)
  const seen=new Set(),origins=new Set(),matched=new Set()
  for(let page=1;page<=20;page++) {
    const result=await api(admin,governance('TRAINING')+`/catalog?page=${page}&pageSize=25`,'GET',undefined,'MANAGEMENT')
    assert.equal(result.page,page)
    for(const row of result.list) {
      assert(!seen.has(row.catalogId),'Catalog pagination repeated identity');seen.add(row.catalogId);origins.add(row.origin)
      const source=sources.find(item=>item.entry.id===row.exactVersion.entryId)
      if(source){assert.equal(row.exactVersion.releaseId,source.release.releaseId);assert.equal(row.exactVersion.contentHash,source.release.contentHash);assert.equal(row.instrumentClass,'CUSTOM_DESCRIPTIVE');matched.add(source.entry.id)}
    }
    if(!result.hasMore)break
    assert(page<20,'Unexpectedly unbounded isolated catalog')
  }
  assert(origins.has('STANDARD_REGISTRY')&&origins.has('AUTHORED'));assert.equal(matched.size,sources.length)
  evidence.catalog={standardVisible:true,authoredVisible:true,paginationUnique:true,approvedIdentitiesMatched:matched.size}
  check('unified-catalog-exact-identity-pagination')
}
async function verifyIsolatedOrigin(page,origin) {
  await page.goto(origin+'/__governance_ci_identity')
  const marker=JSON.parse(await page.locator('body').innerText())
  assert.deepEqual(marker,{isolated:true,sourceCommit:process.env.GITHUB_SHA,runId:process.env.GITHUB_RUN_ID})
  assert.equal(fixture.ciRunId,process.env.GITHUB_RUN_ID)
  assert.equal(new URL(page.url()).origin,origin)
  assert(await page.evaluate(()=>isSecureContext))
}
function prerequisites() {
  assert.equal(process.env.SCALE_GOVERNANCE_ISOLATED,'1');assert.equal(process.env.GITHUB_ACTIONS,'true');assert.equal(process.env.NODE_ENV,'test')
  const root=path.resolve(process.env.RUNNER_TEMP,'scale-library-governance-private'),file=process.env.SCALE_GOVERNANCE_FIXTURE_FILE
  assert.equal(path.dirname(path.resolve(file)),root)
  for(const target of [root,file]){const stat=fs.lstatSync(target);assert(!stat.isSymbolicLink()&&(stat.mode&0o077)===0);assert.equal(fs.realpathSync(target),path.resolve(target))}
  fixture=JSON.parse(fs.readFileSync(file,'utf8'));assert.equal(fixture.schemaVersion,1);assert.equal(fixture.isolated,true);assert.equal(fixture.sourceCommit,process.env.GITHUB_SHA)
  assert.equal(fixture.trainingUrl,'https://training.eduk12.top');assert.equal(fixture.surveyUrl,'https://survey.eduk12.top')
  for(const actor of [fixture.teacher,fixture.student,fixture.administrator,fixture.researcher]){assert(actor.id&&actor.username&&actor.password);secrets.add(actor.password)}
  assert(fixture.administrator.enrollmentToken);secrets.add(fixture.administrator.enrollmentToken);secrets.add(fixture.researcher.totpSecretBase64)
  output=path.resolve(process.env.SCALE_GOVERNANCE_EVIDENCE_DIR);assert(output!==root&&!output.startsWith(root+path.sep));fs.mkdirSync(output,{recursive:true})
  evidence.sourceCommit=process.env.GITHUB_SHA;evidence.ciRunId=process.env.GITHUB_RUN_ID
}
async function trainingComposite(author,source) {
  phase('training-recipient-owned-course-delivery')
  const listed=await api(author,'/api/scales?page=1&pageSize=50')
  const wrapper=listed.list.find(row=>row.libraryEntryId===source.entry.id);assert(wrapper)
  assert.equal(wrapper.measurementReleaseId,source.release.releaseId)
  assert.equal(wrapper.visibility,'COURSE');assert.equal(wrapper.status,'PUBLISHED')
  const detail=await api(author,'/api/scales/'+wrapper.id)
  assert.deepEqual(detail.definition,source.compiledDefinition)
  assert.equal(detail.libraryEntryId,source.entry.id)
  const base='/api/composite-assessments'
  const composite=await api(author,base,'POST',{code:'LIBRARY-COMPOSITE-'+fixture.runId,name:'Synthetic Survey library in Training',courseId:fixture.courseId,publicEnabled:false,maxAttempts:1})
  const item=await api(author,base+'/'+composite.id+'/items','POST',{type:'SCALE',scaleId:wrapper.id,required:true})
  const published=await api(author,base+'/'+composite.id+'/publish','POST',{})
  assert.equal(published.status,'PUBLISHED')
  check('survey-to-training-recipient-course-published')
  return {composite,item,wrapper,definition:detail.definition}
}
async function trainingParticipant(delivery,source) {
  phase('training-composite-all-at-once-final')
  const page=await pageFor();await trainingLogin(page,fixture.student,true)
  const admission=page.waitForResponse(r=>r.request().method()==='POST'&&new URL(r.url()).pathname===`/api/composite-assessments/${delivery.composite.id}/attempts`).then(parsed)
  await page.goto(fixture.trainingUrl+'/student/composite/'+delivery.composite.id)
  const started=await admission,attempt=started.attempt
  assert(attempt?.id&&attempt.currentItem?.scale)
  const unit=attempt.currentItem
  assert.equal(unit.scale.id,delivery.wrapper.id)
  assert.equal(unit.presentationMode,'ALL_AT_ONCE')
  const surface=page.locator('[data-scale-presentation-mode="ALL_AT_ONCE"]');await surface.waitFor()
  assert.equal(await button(surface,'下一题').count(),0);assert.equal(await button(surface,'上一题').count(),0)
  assert.equal(unit.scale.definition.items.length,3)
  const expected=[]
  for(const [index,item]of unit.scale.definition.items.entries()) {
    const group=surface.getByRole('group',{name:item.content,exact:true});await group.waitFor()
    const label=index===1?'Survey 二分':'Survey 一分',option=item.options.find(row=>row.label===label);assert(option)
    // Async IndexedDB persistence: click once then wait for this stable group's
    // checked state. No transient old-page .check() or synthetic persistence.
    await group.getByRole('button',{name:label,exact:true}).click()
    await group.getByRole('button',{name:label,exact:true,pressed:true}).waitFor()
    expected.push({itemCode:item.itemCode,responseValue:option.value})
  }
  for(const item of unit.scale.definition.items)assert(await surface.getByRole('group',{name:item.content,exact:true}).isVisible())
  await captureAndAudit(page,'training-all-at-once')
  const reportResponse=page.waitForResponse(r=>r.request().method()==='GET'&&new URL(r.url()).pathname===`/api/composite-assessments/attempts/${attempt.id}/report`,{timeout:90000}).then(parsed)
  const final=await action(page,`/api/composite-assessments/attempts/${attempt.id}/items/${unit.id}/scale/submit`,()=>button(page,'提交整份量表').click())
  assert.deepEqual(final.request.postDataJSON().answers.map(({itemCode,responseValue})=>({itemCode,responseValue})),expected)
  // Navigate to the actual parent-task report, not a legacy child scale report.
  const reportUrl=fixture.trainingUrl+`/student/composite/attempts/${attempt.id}/report`
  await Promise.race([page.waitForURL(reportUrl),button(page,'查看本次结果').waitFor()])
  if(page.url()!==reportUrl)await button(page,'查看本次结果').click()
  await page.waitForURL(reportUrl)
  const report=await reportResponse
  const result=report.unitReports.find(row=>row.type==='SCALE'&&row.scaleId===delivery.wrapper.id);assert(result)
  assert.deepEqual(result.scores.map(({key,value})=>({key,value})),[{key:'total',value:1}])
  await page.getByText('SURVEY LIBRARY FEEDBACK',{exact:true}).waitFor()
  evidence.media.push({name:'training-parent-report-image',...await renderedImage(page.getByAltText('SURVEY LIBRARY FEEDBACK image',{exact:true}),source.image.contentHash)})
  evidence.journeys.push({name:'survey-to-training',allAtOnce:true,finalAnswerCount:3,contentScore:1,qualityItemsExcluded:2,exactApprovedRelease:true,reportImageExact:true})
  check('survey-to-training-composite-final-all-at-once')
  return {page,attempt,final,report}
}
async function revisionAndOrdinaryRevoke(author,admin,source,shared) {
  phase('new-revision-keeps-old-frozen-version')
  const revision=await api(author,`/api/scales/${source.sourceId}/revise`,'POST',{})
  assert.notEqual(revision.id,source.sourceId)
  const definition=structuredClone(revision.definition);definition.items[0].content='Training revised v2 content never used by frozen v1'
  await api(author,`/api/scales/${revision.id}/definition`,'PUT',{definition})
  const updated=await api(author,`/api/scales/${revision.id}`)
  const published=await api(author,`/api/scales/${revision.id}/publish`,'POST',{expectedUpdatedAt:updated.updatedAt})
  assert.notEqual(published.measurementReleaseId,source.release.releaseId)
  const unchanged=await api(admin,governance('TRAINING')+'/submissions/'+source.submission.id,'GET',undefined,'MANAGEMENT')
  assert.equal(unchanged.releaseId,source.release.releaseId);assert.deepEqual(unchanged.snapshot.definition,source.definition)
  const revoked=await api(admin,governance('TRAINING')+'/grants/'+source.grant.id+'/revoke','POST',{expectedVersion:source.grant.version,reason:'Synthetic ordinary revoke: existing frozen wave must continue'},'MANAGEMENT')
  assert.equal(revoked.status,'REVOKED')
  shared.ordinaryGrantRevoked=true
  check('v2-and-ordinary-revoke-preserve-exact-frozen-v1')
}
async function emergencyStopAndReplay(admin,shared,source,completed) {
  phase('emergency-stop-new-admission-preserve-final-replay')
  const stopped=await api(admin,governance('TRAINING')+'/emergency-stops','POST',{targetKind:'RELEASE',targetId:source.release.releaseId,reason:'Synthetic emergency test; retain prior answers and reports'},'MANAGEMENT')
  assert.equal(stopped.stopped,true)
  const original=completed.final.request.postDataJSON()
  const endpoint=new URL(completed.final.request.url()).pathname
  const replay=await completed.page.evaluate(async({endpoint,body})=>{
    const response=await fetch(endpoint,{method:'POST',credentials:'omit',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})
    return {status:response.status,body:await response.json()}
  },{endpoint,body:original})
  assert.equal(replay.status,200);assert.equal(replay.body.code,0);assert.equal(replay.body.data.idempotent,true)
  assert.equal(replay.body.data.receiptId,completed.final.data.receiptId)
  const newcomer=await pageFor();await newcomer.goto(shared.url.href)
  await button(newcomer,'选择本轮').click()
  await newcomer.getByRole('checkbox',{name:/我已阅读并同意本轮研究说明/}).check()
  const [denied]=await Promise.all([newcomer.waitForResponse(r=>r.request().method()==='POST'&&/\/api\/public\/survey\/r\/[^/]+\/waves\/[^/]+\/start-unlinked$/.test(new URL(r.url()).pathname)),button(newcomer,'开始或恢复本轮作答').click()])
  const failure=await denied.json();assert.equal(denied.status(),409);assert.equal(failure.code,-1)
  assert.equal(failure.message,'该量表版本已紧急停用，停止新增进入和采集；历史结果保留')
  await newcomer.getByText(failure.message,{exact:true}).waitFor()
  evidence.lifecycle={newRevisionDistinct:true,ordinaryRevocationFrozenFinalPassed:true,emergencyNewAdmissionStatus:409,previousFinalReplayStatus:200,sameReceipt:true}
  check('emergency-denies-new-collection-preserves-final-replay')
}
async function main() {
  try {
    prerequisites();save()
    assert.equal(process.env.MEASUREMENT_BROWSER_EPHEMERAL_CA_APPROVED,'true')
    const profileHome=path.resolve(process.env.MEASUREMENT_BROWSER_PROFILE_HOME)
    assert(profileHome.startsWith(path.dirname(process.env.SCALE_GOVERNANCE_FIXTURE_FILE)+path.sep));assert.equal(fs.realpathSync(profileHome),profileHome)
    const {chromium}=require(process.env.SCALE_GOVERNANCE_PLAYWRIGHT_MODULE||'../backend/node_modules/playwright-core')
    browser=await chromium.launch({headless:true,env:{...process.env,HOME:profileHome},executablePath:process.env.SCALE_GOVERNANCE_CHROMIUM_EXECUTABLE||chromium.executablePath(),args:['--host-resolver-rules=MAP training.eduk12.top 127.0.0.1, MAP survey.eduk12.top 127.0.0.1']})
    const author=await pageFor(),researcher=await pageFor(),admin=await pageFor()
    await verifyIsolatedOrigin(author,fixture.trainingUrl);await verifyIsolatedOrigin(researcher,fixture.surveyUrl);await verifyIsolatedOrigin(admin,fixture.trainingUrl)
    await trainingLogin(author,fixture.teacher);await surveyLogin(researcher);await adminLogin(admin)
    const first=await reviewAndGrant(admin,await applyForLibrary(author,await authorTraining(author)),'SURVEY',fixture.researcher)
    const shared=await importAndFreeze(researcher,first)
    await revisionAndOrdinaryRevoke(author,admin,first,shared)
    const surveyResult=await surveyParticipant(shared,first)
    await captureAndAudit(surveyResult.page,'survey-shared-scale-report')
    const second=await reviewAndGrant(admin,await applyForLibrary(researcher,await authorSurvey(researcher)),'TRAINING',fixture.teacher)
    const delivery=await trainingComposite(author,second)
    await trainingParticipant(delivery,second)
    await emergencyStopAndReplay(admin,shared,first,surveyResult)
    await catalogIdentity(admin,[first,second]);await captureAndAudit(admin,'library-governance')
    assert.equal(evidence.browserErrors.length,0);assert.equal(evidence.blockedExternalRequests,0)
    assert(evidence.layoutChecks.every(row=>!row.overflow));assert(evidence.accessibility.every(row=>row.violations.length===0))
    const required=['real-virtual-ctap2-administrator-session','real-upload-worker-completed','training-approved-and-granted-survey','training-to-survey-readonly-exact-release-frozen','v2-and-ordinary-revoke-preserve-exact-frozen-v1','training-to-survey-final-original-scorer-media','survey-approved-and-granted-training','survey-to-training-recipient-course-published','survey-to-training-composite-final-all-at-once','emergency-denies-new-collection-preserves-final-replay','unified-catalog-exact-identity-pagination']
    assert.deepEqual(evidence.checks,required)
    evidence.status='PASS';phase('complete')
  } catch(error) {
    evidence.status='FAIL';evidence.failure=clean({phase:evidence.phase,name:error.name,message:error.message,stack:error.stack?.split('\n').slice(0,8).join('\n')})
    if(activePage&&output)try{const file='failure.png';await activePage.screenshot({path:path.join(output,file),fullPage:true,mask:[activePage.locator('input,textarea,code,[href*="/r/"]')]});evidence.failureScreenshot=file}catch(screenshotError){evidence.screenshotFailure=clean(screenshotError.message)}
    process.exitCode=1
  } finally {
    if(browser)await browser.close();save()
  }
}
if(require.main===module)void main()
module.exports={trainingDefinition,feedback}
