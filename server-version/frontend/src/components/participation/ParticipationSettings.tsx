import {useCallback,useEffect,useRef,useState} from 'react'
import '../../survey/survey-participant.css'
export type ParticipationSettingsValue={projectId?:string;revision:number;mode:'PERSONAL_LINK'|'MEMORABLE_CODE'|'SELF_CODE';label:string;instructions:string;locked:boolean;shortCodes?:string[];
 page:number;hasNext:boolean;participants:{prefix:string;participantId:string|null;participant:{researchCode:string;status:string}|null;resetExpiresAt:string|null}[]}
export type ParticipationSettingsInput=Pick<ParticipationSettingsValue,'revision'|'mode'|'label'|'instructions'>&{shortCodes:string[]}
type Props={scopeId:string;revision:number;load:(page?:number)=>Promise<ParticipationSettingsValue>;saveSettings:(input:ParticipationSettingsInput)=>Promise<ParticipationSettingsValue>;resetCode:(prefix:string)=>Promise<{resetCode:string;expiresAt:string}>;onRevision?:(revision:number)=>void;training?:boolean}
/** Same owner interaction in both products; authority and persistence remain in adapters. */
export function ParticipationSettings({scopeId,revision,load,saveSettings,resetCode,onRevision,training=false}:Props){
 const epoch=useRef(0),working=useRef(false)
 const invalidate=useCallback(()=>{epoch.current++},[])
 const [saved,setSaved]=useState<ParticipationSettingsValue|null>(null),[mode,setMode]=useState<ParticipationSettingsValue['mode']>('PERSONAL_LINK')
 const [label,setLabel]=useState('报名序号'),[instructions,setInstructions]=useState('请输入研究者分配给你的编号。'),[codes,setCodes]=useState('')
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[prefix,setPrefix]=useState('')
 const [reset,setReset]=useState<{resetCode:string;expiresAt:string;prefix:string}|null>(null)
 const apply=(s:ParticipationSettingsValue)=>{setSaved(s);setMode(s.mode);setLabel(s.label);setInstructions(s.instructions);setCodes(s.shortCodes?.join('\n')??'')}
 useEffect(()=>{const current=++epoch.current;working.current=false;setBusy(false);setSaved(null);setError('');setNotice('');setReset(null);setPrefix('');void load().then(s=>{if(current===epoch.current)apply(s)}).catch(()=>{if(current===epoch.current)setError('参与方式未能载入，请刷新页面重试。')});return invalidate},[scopeId,load,revision,invalidate])
 const save=async()=>{if(working.current||!saved||saved.locked)return;const current=epoch.current;working.current=true;setBusy(true);setError('');setNotice('');try{
  const result=await saveSettings({revision:saved.revision,mode,label,instructions,
   shortCodes:mode==='MEMORABLE_CODE'?codes.split(/\r?\n/).map(code=>code.trim()).filter(Boolean):[]})
  if(current!==epoch.current)return
  apply(result);onRevision?.(result.revision);setNotice(training?'参与方式已保存。首次建立波次或领取身份后固定，所有波次使用同一种方式。':'参与方式已保存。首次冻结后固定，所有波次使用同一种方式。')
 }catch(e){if(current===epoch.current)setError(e instanceof Error?e.message:'保存失败')}finally{if(current===epoch.current){working.current=false;setBusy(false)}}}
 const issueReset=async()=>{if(working.current)return;if(training&&!window.confirm('确认给此被试签发一次性重置码？旧编码和旧页面凭据会立即失效，历史作答保留。请先核对该被试与短编号的对应关系，并只将重置码交给本人。'))return;const current=epoch.current;working.current=true;setBusy(true);setError('');setReset(null);try{
  const requestedPrefix=prefix.trim();const value=await resetCode(requestedPrefix);if(current===epoch.current)setReset({...value,prefix:requestedPrefix})
 }catch(e){if(current===epoch.current)setError(e instanceof Error?e.message:'重置失败')}finally{if(current===epoch.current){working.current=false;setBusy(false)}}}
 const page=async(n:number)=>{if(working.current)return;const current=epoch.current;working.current=true;setBusy(true);setError('');setReset(null);try{const value=await load(n);if(current===epoch.current)setSaved(value)}catch(e){if(current===epoch.current)setError(e instanceof Error?e.message:'读取失败')}finally{if(current===epoch.current){working.current=false;setBusy(false)}}}
 return <section className="survey-participation-settings survey-participant-panel" aria-label="多波次参与方式">
  <h3>多波次参与方式</h3><p>{training?'建立首个波次前选择一种方式，整个培训活动保持一致。不创建学员账号或师生关系。':'发布前选择一种方式，整个研究保持一致。'}</p>
  {error&&<p role="alert">{error}</p>}{notice&&<p role="status">{notice}</p>}
  {!saved&&!error&&<p role="status">正在载入参与方式…</p>}
  {saved&&<><fieldset disabled={busy||saved.locked} className="survey-participation-choices"><legend>后续如何继续参加</legend>
   <label><input type="radio" name={'participation-mode-'+scopeId} checked={mode==='PERSONAL_LINK'} onChange={()=>setMode('PERSONAL_LINK')}/><span><strong>专属链接与二维码</strong><small>被试自行保存，点击或扫码继续。</small></span></label>
   <label><input type="radio" name={'participation-mode-'+scopeId} checked={mode==='MEMORABLE_CODE'} onChange={()=>setMode('MEMORABLE_CODE')}/><span><strong>可记忆研究编码</strong><small>研究者分配短编号，被试加上私人后缀。适合机房和共用设备。</small></span></label>
   <label><input type="radio" name={'participation-mode-'+scopeId} checked={mode==='SELF_CODE'} onChange={()=>setMode('SELF_CODE')}/><span><strong>随机研究编码</strong><small>系统随机生成，只需保存这一个编码；无需填写个人信息。</small></span></label>
   {mode==='SELF_CODE'&&<p>{training?'被试确认研究内关联说明后领取随机编码，研究同意另行确认。':'被试在首次知情同意后领取随机编码，'}后续只输入这个编码。请提醒被试复制或截图保存；丢失后无法找回，也不提供研究者重置。</p>}
   {mode==='MEMORABLE_CODE'&&<div className="survey-code-settings-fields">
    <label>短编号名称<input className="input" value={label} onChange={e=>setLabel(e.target.value)} maxLength={40}/></label>
    <label>给被试的填写说明<textarea className="input" value={instructions} onChange={e=>setInstructions(e.target.value)} maxLength={500}/></label>
    {!saved.locked&&<label>可用短编号（每行一个）<textarea className="input survey-code-roster" rows={5} value={codes} onChange={e=>setCodes(e.target.value)} placeholder={'001\n002\n003'}/><small>可粘贴报名序号或班级学号；1–20位数字、字母或汉字，最多5000个，不可重复。请将各编号分配给对应被试。</small></label>}
    <p>熟悉报名或班级名单的人可能识别被试，请在知情同意中说明编码关联范围。私人后缀不向研究者展示。</p>
   </div>}
  </fieldset>
  {saved.locked?<p className="survey-code-muted">{training?'已建立波次或领取身份，参与方式和编号名单固定。':'已冻结发布，参与方式和编号名单固定。'}</p>:<button className="btn-primary" type="button" disabled={busy} onClick={()=>void save()}>保存参与方式</button>}
  {saved.mode==='MEMORABLE_CODE'&&saved.locked&&<details className="survey-code-admin"><summary>管理短编号与重置</summary>
   <p>先核对被试对应的短编号。重置会使旧编码和旧页面凭证失效，历史回答仍关联原记录。</p>
   <ul>{saved.participants.map(row=><li key={row.prefix}><strong>{row.prefix}</strong> · {row.participant?row.participant.researchCode+' · 已参加':'尚未参加'}</li>)}</ul>
   <nav aria-label="短编号分页"><button type="button" className="btn-secondary" disabled={busy||saved.page===1} onClick={()=>void page(saved.page-1)}>上一页</button><span>第 {saved.page} 页</span><button type="button" className="btn-secondary" disabled={busy||!saved.hasNext} onClick={()=>void page(saved.page+1)}>下一页</button></nav>
   <label>要重置的短编号<input className="input" autoComplete="off" disabled={busy} value={prefix} onChange={e=>{setPrefix(e.target.value);setReset(null)}}/></label>
   <button type="button" className="btn-secondary" disabled={busy||!prefix.trim()} onClick={()=>void issueReset()}>签发一次性重置码</button>
   {!training&&<p><a href={'/workspace?project='+scopeId+'&section=data#survey-data-export'}>先完成动态验证码验证</a>，验证后五分钟内可重置。</p>}
   {reset&&<div role="status" className="survey-code-reset-result"><p>请将此一次性重置码仅交给短编号 {reset.prefix} 对应的被试：</p><code>{reset.resetCode}</code><p>30分钟内有效。被试在参与入口选择“研究者已为我重置编码”，再设置新的私人后缀。请不要代设或索取后缀。</p></div>}
  </details>}</>}
 </section>
}
