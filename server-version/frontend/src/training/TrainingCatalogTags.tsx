import {useState} from 'react'
import apiClient from '../api/client'
import './training-catalog-controls.css'
export default function TrainingCatalogTags({id,kind,tags=[],onSaved}:{id:string;kind:string;tags?:string[];onSaved:()=>void}){
 const [draft,setDraft]=useState(tags.join(', ')),[busy,setBusy]=useState(false),[error,setError]=useState('')
 return <details className="training-catalog-tags"><summary>管理标签{tags.length?' · '+tags.join(' / '):''}</summary><form onSubmit={async event=>{event.preventDefault();if(busy)return;const values=[...new Set(draft.split(/[,，]/).map(v=>v.trim()).filter(Boolean))];if(values.length>10||values.some(v=>v.length>20)){setError('最多 10 个标签，每个最多 20 个字');return}setBusy(true);setError('');try{const response=await apiClient.post('/questionnaire-products/'+encodeURIComponent(id)+'/catalog-tags',{kind,tags:values,expectedTags:tags});if(response.code!==0)throw Error(response.message||'保存失败');onSaved()}catch(cause){setError(cause instanceof Error?cause.message:'保存失败')}finally{setBusy(false)}}}><label>标签<input aria-label="测评标签" value={draft} maxLength={209} onChange={e=>setDraft(e.target.value)} placeholder="用逗号分隔，如：课前, 第一期" disabled={busy}/></label><button type="submit" disabled={busy}>{busy?'保存中…':'保存标签'}</button><p>用于查找；修改后应用于该测评在所有课程中的管理标签。</p>{error&&<p role="alert">{error}</p>}</form></details>
}
