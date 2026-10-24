import {useEffect,useState} from 'react'
import './survey-participant.css'
type Settings={projectId:string;revision:number;mode:'PERSONAL_LINK'|'MEMORABLE_CODE'|'SELF_CODE';label:string;instructions:string;locked:boolean;shortCodes?:string[];
 page:number;hasNext:boolean;participants:{prefix:string;participantId:string|null;participant:{researchCode:string;status:string}|null;resetExpiresAt:string|null}[]}
type Transport=<T>(path:string,method?:string,body?:unknown)=>Promise<T>
export function SurveyParticipationSettings({projectId,revision,request,onRevision}:{projectId:string;revision:number;request:Transport;onRevision:(revision:number)=>void}){
 const [saved,setSaved]=useState<Settings|null>(null),[mode,setMode]=useState<Settings['mode']>('PERSONAL_LINK')
 const [label,setLabel]=useState('报名序号'),[instructions,setInstructions]=useState('请输入研究者分配给你的编号。'),[codes,setCodes]=useState('')
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[prefix,setPrefix]=useState('')
 const [reset,setReset]=useState<{resetCode:string;expiresAt:string}|null>(null)
 const path='/projects/'+projectId+'/participation'
 const apply=(s:Settings)=>{setSaved(s);setMode(s.mode);setLabel(s.label);setInstructions(s.instructions);setCodes(s.shortCodes?.join('\n')??'')}
 useEffect(()=>{let live=true;setSaved(null);setError('');void request<Settings>(path).then(s=>{if(live)apply(s)}).catch(()=>{if(live)setError('参与方式未能载入，请刷新页面重试。')});return()=>{live=false}},[path,request,revision])
 const save=async()=>{setBusy(true);setError('');setNotice('');try{
  const result=await request<Settings>(path,'PATCH',{revision:saved!.revision,mode,label,instructions,
   shortCodes:mode==='MEMORABLE_CODE'?codes.split(/\r?\n/).map(code=>code.trim()).filter(Boolean):[]})
  apply(result);onRevision(result.revision);setNotice('参与方式已保存。首次冻结后固定，所有波次使用同一种方式。')
 }catch(e){setError(e instanceof Error?e.message:'保存失败')}finally{setBusy(false)}}
 const issueReset=async()=>{setBusy(true);setError('');setReset(null);try{
  setReset(await request(path+'/reset','POST',{prefix}))
 }catch(e){setError(e instanceof Error?e.message:'重置失败')}finally{setBusy(false)}}
 const page=async(n:number)=>{setBusy(true);setError('');try{setSaved(await request<Settings>(path+'?page='+n))}catch(e){setError(e instanceof Error?e.message:'读取失败')}finally{setBusy(false)}}
 return <section className="survey-participation-settings survey-participant-panel" aria-label="多波次参与方式">
  <h3>多波次参与方式</h3><p>发布前选择一种方式，整个研究保持一致。</p>
  {error&&<p role="alert">{error}</p>}{notice&&<p role="status">{notice}</p>}
  {!saved&&!error&&<p role="status">正在载入参与方式…</p>}
  {saved&&<><fieldset disabled={busy||saved.locked} className="survey-participation-choices"><legend>后续如何继续参加</legend>
   <label><input type="radio" name={'participation-mode-'+projectId} checked={mode==='PERSONAL_LINK'} onChange={()=>setMode('PERSONAL_LINK')}/><span><strong>专属链接与二维码</strong><small>被试自行保存，点击或扫码继续。</small></span></label>
   <label><input type="radio" name={'participation-mode-'+projectId} checked={mode==='MEMORABLE_CODE'} onChange={()=>setMode('MEMORABLE_CODE')}/><span><strong>可记忆研究编码</strong><small>研究者分配短编号，被试加上私人后缀。适合机房和共用设备。</small></span></label>
   <label><input type="radio" name={'participation-mode-'+projectId} checked={mode==='SELF_CODE'} onChange={()=>setMode('SELF_CODE')}/><span><strong>随机研究编码</strong><small>系统随机生成，只需保存这一个编码；无需填写个人信息。</small></span></label>
   {mode==='SELF_CODE'&&<p>被试在首次知情同意后领取随机编码，后续只输入这个编码。请提醒被试复制或截图保存；丢失后无法找回，也不提供研究者重置。</p>}
   {mode==='MEMORABLE_CODE'&&<div className="survey-code-settings-fields">
    <label>短编号名称<input className="input" value={label} onChange={e=>setLabel(e.target.value)} maxLength={40}/></label>
    <label>给被试的填写说明<textarea className="input" value={instructions} onChange={e=>setInstructions(e.target.value)} maxLength={500}/></label>
    {!saved.locked&&<label>可用短编号（每行一个）<textarea className="input survey-code-roster" rows={5} value={codes} onChange={e=>setCodes(e.target.value)} placeholder={'001\n002\n003'}/><small>可粘贴报名序号或班级学号；1–20位数字、字母或汉字，最多5000个，不可重复。请将各编号分配给对应被试。</small></label>}
    <p>熟悉报名或班级名单的人可能识别被试，请在知情同意中说明编码关联范围。私人后缀不向研究者展示。</p>
   </div>}
  </fieldset>
  {saved.locked?<p className="survey-code-muted">已冻结发布，参与方式和编号名单固定。</p>:<button className="btn-primary" type="button" disabled={busy} onClick={()=>void save()}>保存参与方式</button>}
  {saved.mode==='MEMORABLE_CODE'&&saved.locked&&<details className="survey-code-admin"><summary>管理短编号与重置</summary>
   <p>先核对被试对应的短编号。重置会使旧编码和旧页面凭证失效，历史回答仍关联原记录。</p>
   <ul>{saved.participants.map(row=><li key={row.prefix}><strong>{row.prefix}</strong> · {row.participant?row.participant.researchCode+' · 已参加':'尚未参加'}</li>)}</ul>
   <nav aria-label="短编号分页"><button type="button" className="btn-secondary" disabled={busy||saved.page===1} onClick={()=>void page(saved.page-1)}>上一页</button><span>第 {saved.page} 页</span><button type="button" className="btn-secondary" disabled={busy||!saved.hasNext} onClick={()=>void page(saved.page+1)}>下一页</button></nav>
   <label>要重置的短编号<input className="input" autoComplete="off" value={prefix} onChange={e=>setPrefix(e.target.value)}/></label>
   <button type="button" className="btn-secondary" disabled={busy||!prefix.trim()} onClick={()=>void issueReset()}>签发一次性重置码</button>
   <p><a href={'/workspace?project='+projectId+'&section=data#survey-data-export'}>先完成动态验证码验证</a>，验证后五分钟内可重置。</p>
   {reset&&<div role="status" className="survey-code-reset-result"><p>请将此一次性重置码单独交给对应被试：</p><code>{reset.resetCode}</code><p>30分钟内有效。被试在参与入口选择“研究者已为我重置编码”，再设置新的私人后缀。请不要代设或索取后缀。</p></div>}
  </details>}</>}
 </section>
}
