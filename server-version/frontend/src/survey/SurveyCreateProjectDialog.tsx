import { useRef, type FormEvent } from 'react'
import { FolderPlus, X } from 'lucide-react'
import ModalSurface from '../components/shared-ui/ModalSurface'
import './survey-project-dialog.css'

export function SurveyCreateProjectDialog({open,busy,title,description,mode,error,onTitle,onDescription,onMode,onClose,onSubmit}:{
  open:boolean;busy:boolean;title:string;description:string;mode:'SINGLE_UNLINKED'|'LINKED_WAVES';error:string
  onTitle:(value:string)=>void;onDescription:(value:string)=>void;onMode:(value:'SINGLE_UNLINKED'|'LINKED_WAVES')=>void
  onClose:()=>void;onSubmit:(event:FormEvent)=>void
}) {
  const titleRef=useRef<HTMLInputElement>(null)
  return <ModalSurface open={open} onClose={onClose} initialFocusRef={titleRef} className="survey-create-backdrop">
    <section className="survey-create-panel" role="dialog" aria-modal="true" aria-labelledby="survey-create-title" tabIndex={-1}>
      <header className="survey-create-heading"><span className="survey-create-icon"><FolderPlus size={25} strokeWidth={1.5} aria-hidden="true"/></span>
        <div><p>开始一项新研究</p><h2 id="survey-create-title">创建研究项目</h2></div>
        <button type="button" className="survey-create-close" aria-label="关闭新建研究" disabled={busy} onClick={onClose}><X size={20} aria-hidden="true"/></button>
      </header>
      <p className="survey-create-intro">先为研究建立草稿，再编制工具、安排采集与整理数据。</p>
      <form onSubmit={onSubmit} aria-busy={busy}>
        <fieldset disabled={busy} className="survey-create-fields">
          {error&&<p role="alert" className="survey-create-error">{error}</p>}
          <label className="survey-create-field">研究名称<input ref={titleRef} className="input" required value={title} placeholder="为研究起一个清晰的名称" onChange={event=>onTitle(event.target.value)}/></label>
          <label className="survey-create-field">研究说明<span className="survey-create-optional" aria-hidden="true">选填</span><textarea className="input" rows={3} value={description} placeholder="简要说明研究目的、对象或计划" onChange={event=>onDescription(event.target.value)}/></label>
          <fieldset className="survey-create-modes"><legend>采集方式</legend><div>
            <label><input type="radio" name="create-collection-mode" value="SINGLE_UNLINKED" checked={mode==='SINGLE_UNLINKED'} onChange={()=>onMode('SINGLE_UNLINKED')}/><span><strong>单次独立匿名</strong><small>每份回答独立，不关联不同时间点。</small></span></label>
            <label><input type="radio" name="create-collection-mode" value="LINKED_WAVES" checked={mode==='LINKED_WAVES'} onChange={()=>onMode('LINKED_WAVES')}/><span><strong>多波次关联采集</strong><small>按研究编号关联同一被试不同时间点的回答。</small></span></label>
          </div></fieldset>
          {mode==='LINKED_WAVES'&&<p className="survey-create-mode-note">正式采集前，须在知情同意中告知被试回答可按研究编号关联。</p>}
          <p className="survey-create-footnote">创建草稿不会开放招募。发布前仍需检查研究工具、波次与知情同意。</p>
          <footer><button type="button" className="btn-secondary" onClick={onClose}>取消</button><button type="submit" className="btn-primary">{busy?'正在创建…':'创建研究'}</button></footer>
        </fieldset>
      </form>
    </section>
  </ModalSurface>
}
