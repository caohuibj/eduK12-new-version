import {useEffect,useRef,useState} from 'react'
import type {SchoolApi} from './SchoolRecovery'
type Item={id:string;kind:'READING'|'ASSIGNMENT'|'CHECKIN';title:string;content:string|null;updatedAt:string}
type List={list:Item[];truncated:boolean}
const names={READING:'阅读材料',ASSIGNMENT:'练习任务',CHECKIN:'活动记录'}
export function SchoolActivityContent({api,path,editable,disabled,revision}:{api:SchoolApi;path:string;editable:boolean;disabled:boolean;revision:number}){
 const [data,setData]=useState<List|null>(null),[edit,setEdit]=useState<Item|null>(null)
 const [title,setTitle]=useState(''),[content,setContent]=useState(''),[error,setError]=useState(''),[notice,setNotice]=useState('')
 const [loading,setLoading]=useState(false),[writing,setWriting]=useState(false),[refresh,setRefresh]=useState(0)
 const generation=useRef(0),lock=useRef(false)
 useEffect(()=>{
  const token=++generation.current;setLoading(true);setError('');setData(null);setEdit(null)
  void api<List>(path+'/tasks').then(result=>{if(token===generation.current)setData(result)})
   .catch(e=>{if(token===generation.current)setError(e instanceof Error?e.message:'内容读取失败')})
   .finally(()=>{if(token===generation.current)setLoading(false)})
  return()=>{generation.current++}
 },[api,path,revision,refresh])
 const change=async(item:Item,remove=false)=>{
  if(lock.current||disabled||!editable)return
  if(remove&&!window.confirm('从活动草稿移除“'+item.title+'”？已发布活动及有作答的内容不能移除。'))return
  lock.current=true;setWriting(true);setError('');setNotice('')
  const token=generation.current
  try{
   await api(path+'/tasks/'+item.kind+'/'+item.id,remove?'DELETE':'PATCH',{
    expectedUpdatedAt:item.updatedAt,...(!remove?{title,content}:{}),
   })
   if(token===generation.current){setEdit(null);setRefresh(x=>x+1);setNotice(remove?'草稿内容已移除。':'草稿内容已更新。')}
  }catch(e){if(token===generation.current)setError(e instanceof Error?e.message:'内容修改未完成，请刷新活动后核对。')}
  finally{lock.current=false;setWriting(false)}
 }
 return <section className="hs-panel" aria-label="已添加活动内容">
  <h3>已添加的阅读、练习与记录</h3>
  <button type="button" disabled={loading||writing||disabled} onClick={()=>setRefresh(x=>x+1)}>刷新活动内容</button>
  {loading&&<p role="status">正在读取活动内容…</p>}
  {error&&<p role="alert">{error}</p>}{notice&&<p role="status">{notice}</p>}
  {data&&!data.list.length&&<p>尚未添加内容。</p>}
  {!editable&&<p>本活动已离开准备阶段，内容仅供核对，不能修改或移除。</p>}
  {data?.list.map(item=><article key={item.id} className="hs-task-card" data-content-task-id={item.id}>
   <h4>{item.title}</h4><p>{names[item.kind]}</p>
   {editable&&edit?.id===item.id?<form onSubmit={e=>{e.preventDefault();void change(edit)}}>
    <label className="hs-field"><span>修改内容标题</span><input value={title} maxLength={200} disabled={writing} onChange={e=>setTitle(e.target.value)}/></label>
    <label className="hs-field"><span>修改活动正文</span><textarea rows={5} value={content} maxLength={25000} disabled={writing} onChange={e=>setContent(e.target.value)}/></label>
    <button disabled={writing||disabled||!title.trim()}>保存内容修改</button>
    <button type="button" disabled={writing} onClick={()=>setEdit(null)}>取消内容修改</button>
   </form>:<><details><summary>查看内容</summary><p className="hs-multiline">{item.content||'此项没有正文。'}</p></details>
    {editable&&<div className="hs-actions"><button disabled={writing||disabled} onClick={()=>{setEdit(item);setTitle(item.title);setContent(item.content??'')}}>编辑草稿内容</button>
     <button disabled={writing||disabled} onClick={()=>void change(item,true)}>移除草稿内容</button></div>}</>}
  </article>)}
  {data?.truncated&&<p>内容超过当前显示上限，请联系平台核对其余项目；未显示内容不会被删除或覆盖。</p>}
 </section>
}
