import { useEffect, useState } from 'react'
import type { SchoolApi } from './SchoolRecovery'

type ParentLinks = {list:Array<{id:string;status:string}>}
type ReportOption = {id:string;title:string;canConsent:boolean;canRevoke?:boolean;legacy?:boolean}
type Options = {list:ReportOption[];truncated:boolean}
type ParentProjection = {
  title:string; summary?:string; blocks?:Array<{title:string;text:string}>
  policy?:{mode:'COMPLETION_ONLY'|'EDUCATIONAL_SUMMARY'}
}
type ConsentPreview = {
  legacy?:boolean; parentName:string; title?:string; projection?:ParentProjection
  consentVersion?:string;consentText?:string;commandKey?:string;publicationHash?:string
  canConsent:boolean;canRevoke:boolean;consentStatus?:string
}
type Child = {childId:string;relationshipId:string}
type ChildList = {list:Child[];hasMore:boolean}
type ParentReport = {id:string;title:string;mode:'COMPLETION_ONLY'|'EDUCATIONAL_SUMMARY'}
type ParentReportList = {list:ParentReport[];hasMore:boolean}
type ReadParentReport = {audience:'PARENT';title:string;mode:string;summary:string;blocks:Array<{title:string;text:string}>}
type OfficerArtifact = {id:string;title:string;generatedAt:string}
type OfficerList = {list:OfficerArtifact[];hasMore:boolean}
type Template = {key:string;version:string;title:string;mode:'COMPLETION_ONLY'|'EDUCATIONAL_SUMMARY'}
type PublicationPreview = {
  previewHash:string;expectedVersion:number;commandKey:string
  template:{key:string;version:string};projection:ParentProjection
}
type AcceptedConsent = {id:string;relationshipId:string;parentName:string;commandKey:string}
type IndividualWave = {
  ordinal:number;evidenceLevel:string
  metrics:Record<string,{state:string;value?:number}>
}
type StudentLongitudinal = {list:Array<{id:string;generatedAt:string;projection:{waves:IndividualWave[];limitations?:string[]}}>}

const reason=(error:unknown,context:string)=>
  error instanceof Error&&error.message?error.message:context

/** The student controls each report consent separately; an ACTIVE relationship
 * never appears as proof of report sharing. Nothing is persisted in the browser.
 */
export function SchoolStudentReportConsent({api}: {api:SchoolApi}) {
  const [links,setLinks]=useState<ParentLinks|null>(null)
  const [selected,setSelected]=useState<string|null>(null)
  const [options,setOptions]=useState<Options|null>(null)
  const [preview,setPreview]=useState<{artifactId:string;data:ConsentPreview}|null>(null)
  const [busy,setBusy]=useState(false)
  const [notice,setNotice]=useState('')
  const [error,setError]=useState('')
  useEffect(()=>{
    let active=true
    void api<ParentLinks>('/parent-links').then(data=>{if(active)setLinks(data)})
      .catch(e=>{if(active)setError(reason(e,'目前无法查看亲子关联'))})
    return ()=>{active=false}
  },[api])
  const choose=async(relationshipId:string)=>{
    setSelected(relationshipId);setOptions(null);setPreview(null);setError('');setNotice('')
    setBusy(true)
    try{const result=await api<Options>('/reports/relationships/'+relationshipId+'/options')
      setOptions(result)}
    catch(e){setError(reason(e,'报告分享尚未开放'))}
    finally{setBusy(false)}
  }
  const open=async(artifactId:string)=>{
    if(!selected)return
    setPreview(null);setError('');setBusy(true)
    try{const data=await api<ConsentPreview>('/reports/relationships/'+selected+'/artifacts/'+artifactId+'/consent')
      setPreview({artifactId,data})}
    catch(e){setError(reason(e,'这份报告暂不能分享'))}
    finally{setBusy(false)}
  }
  const act=async(kind:'consent'|'revoke')=>{
    if(!selected||!preview)return
    const {artifactId,data}=preview
    if(kind==='consent'&&(!data.consentVersion||!data.commandKey))return
    if(!window.confirm(kind==='revoke'?'撤销这份报告对该家长的同意与授权？':'仅同意分享预览中的这一份家长版报告？分享还需要专业人员单独批准。'))return
    setError('');setNotice('');setBusy(true)
    try{
      const base='/reports/relationships/'+selected+'/artifacts/'+artifactId
      if(kind==='consent')await api(base+'/consent','POST',{
        commandKey:data.commandKey,consentVersion:data.consentVersion,
        ...(data.publicationHash?{publicationHash:data.publicationHash}:{}),
      })
      else await api(base+'/revoke','POST',{reason:'学生主动撤销这份报告的分享'})
      setPreview(null)
      setNotice(kind==='consent'?'已记录你的单份同意。家长仍须等待独立的报告披露授权。':'这份报告的分享同意与授权已撤销。')
    }catch(e){setError(reason(e,'当前报告授权状态已变化，请刷新'))}
    finally{setBusy(false)}
  }
  return <section className="hs-panel">
    <h2>我的报告分享决定</h2>
    <p>亲子关系成立不代表家长可以查看你的心理报告。每一份家长版报告需要经过内容审核、单份同意和专业授权；你可以撤回同意。</p>
    {error&&<p className="hs-alert" role="alert">{error}</p>}
    {notice&&<p className="hs-message" role="status">{notice}</p>}
    {!links?<p>正在查看已确认的亲子关系…</p>:links.list.filter(item=>item.status==='ACTIVE').length===0?
      <p>目前没有已确认的亲子关系，无需设置报告分享。</p>:
      <div className="hs-actions">{links.list.filter(item=>item.status==='ACTIVE').map((item,i)=>
        <button key={item.id} disabled={busy} aria-pressed={selected===item.id}
          onClick={()=>void choose(item.id)}>查看第 {i+1} 位已关联家长的可分享报告</button>)}</div>}
    {selected&&options&&<div className="hs-task-list">
      {options.list.length===0?<p>目前没有经过审核且允许分享的家长版报告。</p>:
        options.list.map(option=><article className="hs-task-card" key={option.id}>
          <h3>{option.title}</h3>
          <p>{option.legacy?'历史授权仅可撤销':'只有你明确同意并经专业批准后，家长才能读取。'}</p>
          <button disabled={busy} onClick={()=>void open(option.id)}>查看单份授权详情</button>
        </article>)}
      {options.truncated&&<p>还有其他记录，请联系学校心理教师核对。</p>}
    </div>}
    {preview&&<div className="hs-task-detail">
      <h3>{preview.data.projection?.title??preview.data.title??'报告分享说明'}</h3>
      <p>分享对象：已确认的家长。以下仅供你本人决定是否授权，不会因为预览自动分享。</p>
      {preview.data.projection?.policy?.mode==='COMPLETION_ONLY'&&
        <p>当前仅可分享“报告已生成”的状态，不包含测评分数或心理解释。</p>}
      {preview.data.projection?.summary&&<p>{preview.data.projection.summary}</p>}
      {preview.data.projection?.blocks?.map((block,i)=><div key={i}><h3>{block.title}</h3><p className="hs-multiline">{block.text}</p></div>)}
      {preview.data.consentText&&<p>{preview.data.consentText}</p>}
      <div className="hs-actions">
        {preview.data.canConsent&&<button disabled={busy} className="hs-primary"
          onClick={()=>void act('consent')}>同意分享此份报告</button>}
        {preview.data.canRevoke&&<button disabled={busy} onClick={()=>void act('revoke')}>撤销此份报告的授权</button>}
        <button onClick={()=>setPreview(null)}>返回列表</button>
      </div>
    </div>}
  </section>
}

/** Only already-granted PARENT projections; switching children clears private
 * content before another request begins and a failed reload cannot reuse it.
 */
export function SchoolParentReports({api}: {api:SchoolApi}) {
  const [children,setChildren]=useState<ChildList|null>(null)
  const [child,setChild]=useState<string|null>(null)
  const [reports,setReports]=useState<ParentReportList|null>(null)
  const [detail,setDetail]=useState<ReadParentReport|null>(null)
  const [error,setError]=useState('')
  const [busy,setBusy]=useState(false)
  useEffect(()=>{
    let active=true
    void api<ChildList>('/reports/parent/children').then(d=>{if(active)setChildren(d)})
      .catch(e=>{if(active)setError(reason(e,'家长报告尚未开放'))})
    return ()=>{active=false}
  },[api])
  const selectChild=async(next:string)=>{
    setChild(next);setReports(null);setDetail(null);setError('');setBusy(true)
    try{setReports(await api<ParentReportList>('/reports/parent/children/'+next+'/reports'))}
    catch(e){setError(reason(e,'无法读取当前孩子的报告'))}
    finally{setBusy(false)}
  }
  const read=async(artifactId:string)=>{
    if(!child)return
    setDetail(null);setError('');setBusy(true)
    try{setDetail(await api<ReadParentReport>('/reports/parent/children/'+child+'/reports/'+artifactId))}
    catch(e){setError(reason(e,'这份报告的授权可能已撤销'))}
    finally{setBusy(false)}
  }
  return <section className="hs-panel">
    <h2>获准查看的家长反馈</h2>
    <p>这里只显示孩子已经单份同意、经过审核发布并获得专业人员独立授权的家长版内容。关联亲子关系本身不授予心理报告权限。</p>
    {error&&<p className="hs-alert" role="alert">{error}</p>}
    {!children?<p>正在核对家长版报告权限…</p>:children.list.length===0?
      <p>目前没有可申请查看报告的有效亲子关系。</p>:
      <div className="hs-actions">{children.list.map((row,i)=>
        <button key={row.relationshipId} disabled={busy} aria-pressed={child===row.childId}
          onClick={()=>void selectChild(row.childId)}>孩子 {i+1} 的获准反馈</button>)}</div>}
    {reports&&<div className="hs-task-list">{reports.list.length===0?
      <p>该孩子目前没有完成全部单份授权步骤的家长报告。</p>:
      reports.list.map(report=><article className="hs-task-card" key={report.id}>
        <h3>{report.title}</h3><p>{report.mode==='COMPLETION_ONLY'?'仅报告完成状态':'经审核的家长教育建议'}</p>
        <button disabled={busy} onClick={()=>void read(report.id)}>查看已授权反馈</button>
      </article>)}</div>}
    {detail&&<div className="hs-task-detail">
      <h3>{detail.title}</h3>
      {detail.mode==='COMPLETION_ONLY'?
        <p>这仅说明相应报告已经生成，不代表孩子的心理状态、诊断或分数。</p>:null}
      {detail.summary&&<p>{detail.summary}</p>}
      {detail.blocks.map((block,i)=><section key={i}><h3>{block.title}</h3>
        <p className="hs-multiline">{block.text}</p></section>)}
      <p>请以理解和支持孩子为出发点，不据此贴标签或监视。需要进一步帮助时请联系学校心理教师。</p>
      <button onClick={()=>setDetail(null)}>关闭报告</button>
    </div>}
  </section>
}

/** Student-facing longitudinal evidence is descriptive only. Per-resource
 * interpretation requires a separate approved youth feedback template.
 */
export function SchoolStudentFeedback({api}: {api:SchoolApi}) {
  const [reports,setReports]=useState<StudentLongitudinal|null>(null)
  const [error,setError]=useState('')
  useEffect(()=>{
    let active=true
    void api<StudentLongitudinal>('/reports/student/longitudinal').then(x=>{if(active)setReports(x)})
      .catch(e=>{if(active)setError(reason(e,'纵向反馈暂不可读取'))})
    return ()=>{active=false}
  },[api])
  return <section className="hs-panel">
    <h2>我的测评反馈</h2>
    <p>完成测评后，只有经授权、科学条件符合的反馈才会在这里显示。某次作答完成不代表立即产生一份心理报告。</p>
    {error&&<p className="hs-alert" role="alert">{error}</p>}
    {!reports?<p>正在读取允许查看的个人纵向记录…</p>:reports.list.length===0?
      <p>目前没有已生成且适合向你展示的纵向反馈。你可以继续查看校园活动，或联系学校心理教师。</p>:
      <div className="hs-task-list">{reports.list.map(report=><article key={report.id} className="hs-task-card">
        <h3>多次测评记录</h3><p>{report.projection.waves.length} 次合法记录</p>
        <p>这些记录不能单独用于诊断，也不能说明变化的原因。</p>
        <ul>{report.projection.waves.map(w=><li key={w.ordinal}>第 {w.ordinal} 次：有 {Object.values(w.metrics).filter(m=>m.state==='present').length} 项可披露记录。</li>)}</ul>
        {report.projection.limitations?.map((limit,i)=><p key={i}>{limit}</p>)}
      </article>)}</div>}
  </section>
}

export function SchoolReportOfficer({api,organizationId}: {api:SchoolApi;organizationId:string}) {
  const [artifacts,setArtifacts]=useState<OfficerList|null>(null)
  const [selected,setSelected]=useState<string|null>(null)
  const [templates,setTemplates]=useState<Template[]>([])
  const [choice,setChoice]=useState('')
  const [preview,setPreview]=useState<PublicationPreview|null>(null)
  const [consents,setConsents]=useState<AcceptedConsent[]>([])
  const [busy,setBusy]=useState(false)
  const [error,setError]=useState('')
  const [notice,setNotice]=useState('')
  const reload=async()=>setArtifacts(await api<OfficerList>('/reports/officer/artifacts?organizationId='+encodeURIComponent(organizationId)))
  useEffect(()=>{
    let active=true
    setArtifacts(null);setSelected(null);setTemplates([]);setPreview(null);setConsents([])
    void api<OfficerList>('/reports/officer/artifacts?organizationId='+encodeURIComponent(organizationId))
      .then(data=>{if(active)setArtifacts(data)})
      .catch(e=>{if(active)setError(reason(e,'当前没有报告披露工作权限'))})
    return ()=>{active=false}
  },[api,organizationId])
  const pick=async(artifactId:string)=>{
    setSelected(artifactId);setTemplates([]);setChoice('');setPreview(null);setConsents([])
    setError('');setNotice('');setBusy(true)
    try{
      const [tools,approved]=await Promise.all([
        api<{list:Template[]}>('/reports/officer/artifacts/'+artifactId+'/templates'),
        api<{list:AcceptedConsent[]}>('/reports/officer/artifacts/'+artifactId+'/consents'),
      ])
      setTemplates(tools.list)
      setConsents(approved.list)
      setChoice(tools.list.length ? tools.list[0].key+':'+tools.list[0].version : '')
    }catch(e){setError(reason(e,'没有合法的报告发布或披露权限'))}
    finally{setBusy(false)}
  }
  const showPreview=async()=>{
    if(!selected||!choice)return
    const chosen=templates.find(t=>t.key+':'+t.version===choice)
    if(!chosen)return
    setPreview(null);setError('');setBusy(true)
    try{setPreview(await api<PublicationPreview>('/reports/officer/artifacts/'+selected+'/preview','POST',{
      templateKey:chosen.key,templateVersion:chosen.version,
    }))}
    catch(e){setError(reason(e,'该报告不满足模板或科学披露条件'))}
    finally{setBusy(false)}
  }
  const publish=async()=>{
    if(!selected||!preview)return
    if(!window.confirm('确认此预览是经过正式审核的家长版内容，并仅开放逐份同意与授权流程？'))return
    setError('');setBusy(true)
    try{
      await api('/reports/officer/artifacts/'+selected+'/publish','POST',{
        templateKey:preview.template.key,templateVersion:preview.template.version,
        previewHash:preview.previewHash,expectedVersion:preview.expectedVersion,commandKey:preview.commandKey,
      })
      setNotice('家长版报告已发布。学生仍需明确同意，之后才能独立审核披露。')
      setPreview(null);await reload()
    }catch(e){setError(reason(e,'发布状态已变化，需要重新预览'))}
    finally{setBusy(false)}
  }
  const grant=async(consent:AcceptedConsent)=>{
    if(!selected)return
    if(!window.confirm('确认你对该学生持有当前有效的专业关系和专项披露权限，并授予这一份报告？'))return
    setError('');setBusy(true)
    try{
      await api('/reports/relationships/'+consent.relationshipId+'/artifacts/'+selected+'/grants','POST',{
        commandKey:consent.commandKey,consentId:consent.id,
      })
      setConsents(prev=>prev.filter(c=>c.id!==consent.id))
      setNotice('单份家长报告已授权；关系、同意和专业权限失效后将重新拒绝读取。')
    }catch(e){setError(reason(e,'授权条件已变化，请重新核实'))}
    finally{setBusy(false)}
  }
  return <section className="hs-panel">
    <h2>心理专业人员 · 家长报告审核</h2>
    <p>本工作区要求当前心理专业关系、专项报告披露能力与有效学校成员身份。仅发布经过科学与文案审核的内容；完成状态不是心理解释。</p>
    {error&&<p className="hs-alert" role="alert">{error}</p>}
    {notice&&<p className="hs-message" role="status">{notice}</p>}
    {!artifacts?<p>正在核查当前学校的报告披露权限…</p>:artifacts.list.length===0?
      <p>当前没有符合专业权限与科学发布条件的报告。</p>:
      <div className="hs-task-list">{artifacts.list.map(item=><article key={item.id} className="hs-task-card">
        <h3>{item.title}</h3><small>{new Date(item.generatedAt).toLocaleDateString('zh-CN')}</small>
        <button disabled={busy} onClick={()=>void pick(item.id)}>审核可发布内容与单份同意</button>
      </article>)}</div>}
    {selected&&<div className="hs-task-detail">
      <h3>家长版发布与授权</h3>
      <p>专业人员不能以自己可以阅读源报告为理由，自动给家长披露。只对合法模板与授权链操作。</p>
      {templates.length>0&&<div className="hs-actions">
        <label className="hs-field"><span>审核通过的家长模板</span>
          <select value={choice} onChange={e=>{setChoice(e.target.value);setPreview(null)}}>
            {templates.map(t=><option key={t.key+':'+t.version} value={t.key+':'+t.version}>
              {t.title}（{t.mode==='COMPLETION_ONLY'?'仅完成状态':'教育建议'}）
            </option>)}
          </select></label>
        <button disabled={!choice||busy} onClick={()=>void showPreview()}>核对预览</button>
      </div>}
      {preview&&<div className="hs-task-card">
        <h3>{preview.projection.title}</h3>
        {preview.projection.policy?.mode==='COMPLETION_ONLY'&&<p>此模板不提供心理分数、解释或诊断。请不要描述成完整家长反馈。</p>}
        {preview.projection.blocks?.map((b,i)=><p className="hs-multiline" key={i}>{b.title}：{b.text}</p>)}
        <button className="hs-primary" disabled={busy} onClick={()=>void publish()}>正式发布此家长版投影</button>
      </div>}
      <h3>学生已同意的单份报告</h3>
      {consents.length===0?<p>目前没有待核对的学生同意。</p>:
        consents.map(c=><div className="hs-task-card" key={c.id}><p>已确认家长：{c.parentName}</p>
          <button disabled={busy} onClick={()=>void grant(c)}>核验当前专业授权后授予此份报告</button>
        </div>)}
      <button onClick={()=>{setSelected(null);setPreview(null);setConsents([])}}>关闭此报告</button>
    </div>}
  </section>
}

type DisclosureOfficer = {
  membershipId:string;displayName:string;hasPsychology:boolean;hasDisclosure:boolean
}
type DisclosureOfficers = {list:DisclosureOfficer[];hasMore:boolean}

/** Governance only. The actual grant/revoke API enforces independent school
 * domain, current ORG_ADMIN, recent TOTP and prohibition of self-grant.
 */
export function SchoolDisclosureOfficers({api,organizationId}: {api:SchoolApi;organizationId:string}) {
  const [officers,setOfficers]=useState<DisclosureOfficers|null>(null)
  const [busy,setBusy]=useState(false)
  const [error,setError]=useState('')
  const [notice,setNotice]=useState('')
  const reload=async()=>{
    const value=await api<DisclosureOfficers>('/organizations/'+organizationId+'/disclosure-officers')
    setOfficers(value)
  }
  useEffect(()=>{
    let active=true
    setOfficers(null);setError('');setNotice('')
    void api<DisclosureOfficers>('/organizations/'+organizationId+'/disclosure-officers')
      .then(value=>{if(active)setOfficers(value)})
      .catch(e=>{if(active)setError(reason(e,'无法核对心理教师名单'))})
    return ()=>{active=false}
  },[api,organizationId])
  const change=async(officer:DisclosureOfficer)=>{
    const grant=!officer.hasDisclosure
    if(grant&&!officer.hasPsychology)return
    if(!window.confirm(grant?'确认向此心理教师授予家长报告逐份披露能力？此授权不自动向家长开放任何报告。':'确认立即撤销此心理教师的家长报告披露能力？已获批的家长访问将重新校验。'))return
    setError('');setNotice('');setBusy(true)
    try{
      const prefix='/organizations/'+organizationId+'/memberships/'+officer.membershipId+'/capabilities'
      await api(prefix+(grant?'':'/revoke'),'POST',{capability:'PARENT_REPORT_DISCLOSURE'})
      await reload()
      setNotice(grant?'已授予专项披露能力；仍需要当前合法个案关系、审核发布和学生单份同意。':'专项披露能力已撤销；新读取需要重新通过权限校验。')
    }catch(e){setError(reason(e,'权限操作未完成，请检查近期 TOTP 验证和当前学校授权'))}
    finally{setBusy(false)}
  }
  return <section className="hs-panel">
    <h2>学校管理员 · 家长报告披露人员授权</h2>
    <p>只有当前受聘的校园心理教师可候选。管理员必须完成近期 TOTP 验证；不能给自己的账号追加敏感能力。授权仅提供操作资格，不赋予对所有学生的报告阅读权。</p>
    {error&&<p className="hs-alert" role="alert">{error}</p>}
    {notice&&<p className="hs-message" role="status">{notice}</p>}
    {!officers?<p>正在读取当前心理教师名单…</p>:officers.list.length===0?
      <p>当前没有已登记的校园心理教师。</p>:
      <div className="hs-task-list">{officers.list.map(officer=><article className="hs-task-card" key={officer.membershipId}>
        <h3>{officer.displayName}</h3>
        <p>{officer.hasPsychology?'持有心理专业能力':'尚未授予心理专业能力'}</p>
        <p>{officer.hasDisclosure?'已有家长报告逐份披露能力':'没有家长报告披露能力'}</p>
        <button disabled={busy||(!officer.hasPsychology&&!officer.hasDisclosure)}
          onClick={()=>void change(officer)}>
          {officer.hasDisclosure?'撤销披露能力':'授予专项披露能力'}
        </button>
      </article>)}</div>}
    {officers?.hasMore&&<p>可管理人员超过当前列表范围，请先调整学校成员安排。</p>}
  </section>
}
