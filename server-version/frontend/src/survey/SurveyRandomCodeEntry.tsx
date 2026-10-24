import {useState,type ReactNode} from 'react'

type Props={name:string;consentText:string;fullCode:string;copied:boolean;busy:boolean;deadline?:string;
 onConsent:()=>void;onCopied:()=>void;onStart:()=>void;recovery:ReactNode}
/** Each action replaces the previous step; credentials remain in tab memory only. */
export function SurveyRandomCodeEntry({name,consentText,fullCode,copied,busy,deadline,onConsent,onCopied,onStart,recovery}:Props){
 const [copying,setCopying]=useState(false),[copyError,setCopyError]=useState(false)
 const copy=async()=>{
  if(copying||busy)return
  setCopying(true);setCopyError(false)
  try{await navigator.clipboard.writeText(fullCode);onCopied()}
  catch{setCopyError(true)}finally{setCopying(false)}
 }
 return <section className="survey-participant-panel survey-random-entry" aria-label={!fullCode?'知情同意书':copied?'准备答题':'保存研究编码'}>
  {!fullCode?<>
   <span className="survey-random-entry-kicker">参与前，请先阅读</span>
   <h2>知情同意书</h2><p className="survey-random-study-name">{name}</p>
   <p className="survey-consent-text whitespace-pre-wrap">{consentText}</p>
   {deadline&&<p className="survey-random-deadline">{deadline}</p>}
   <button type="button" className="btn-primary survey-participant-action" disabled={busy} onClick={onConsent}>我已阅读并同意，参加问卷</button>
   <p className="survey-random-entry-note">参加由你决定；不愿参加可直接关闭本页。</p>
   <details className="survey-random-returning"><summary>已参加过？使用研究编码继续</summary>{recovery}</details>
  </>:copied?<>
   <span className="survey-random-entry-kicker">最后确认</span><h2>请确认已保存编码</h2>
   <p>请将编码保存到自己的备忘录或截图留存。丢失后无法找回，也无法重新生成原答卷的编码。</p>
   <button type="button" className="btn-primary survey-participant-action" disabled={busy} onClick={onStart}>我已保存，进入答题</button>
   <details className="survey-random-returning"><summary>查看研究编码</summary><code className="survey-memorable-display">{fullCode}</code></details>
  </>:<>
   <span className="survey-random-entry-kicker">下一次参加，也用这个编码</span><h2>保存你的研究编码</h2>
   <code className="survey-memorable-display">{fullCode}</code>
   <p className="survey-identity-save-notice">请现在保存。丢失后无法找回，也无法重新生成原答卷的编码。仅供本人使用，请勿转发。</p>
   <button type="button" className="btn-primary survey-participant-action" disabled={busy||copying} onClick={()=>void copy()}>{copying?'正在复制…':'复制研究编码'}</button>
   {copyError&&<><p role="alert">无法自动复制，请手动复制上方编码或截图保存。</p>
    <button type="button" className="btn-secondary survey-participant-action" disabled={busy} onClick={onCopied}>我已手动保存</button></>}
  </>}
 </section>
}
