import {useEffect,useRef,useState} from 'react'
import apiClient from '../../api/client'
import {TagEditor} from './ToolCatalogTags'
import './tool-catalog-tags.css'

type TagSet = {tags:string[];revision:number}
type TagChange = {tags:string[];expectedRevision:number}
type Requester = <T>(path:string,method?:string,body?:unknown)=>Promise<T>
type Props = {name:string} & (
 {path:string;api?:Requester} |
 {scopeKey:string;load:()=>Promise<TagSet>;save:(changes:TagChange)=>Promise<TagSet>}
)

export default function PrivateToolTags(props:Props){
 const [open,setOpen]=useState(false)
 const name=props.name
 const scope='path' in props?props.path:props.scopeKey
 const actions='path' in props?{
  load:async()=>{
   if(props.api)return props.api<TagSet>(props.path,'GET')
   return requireTags((await apiClient.get<TagSet>(props.path)).data)
  },
  save:async(changes:TagChange)=>{
   if(props.api)return props.api<TagSet>(props.path,'PUT',changes)
   return requireTags((await apiClient.put<TagSet>(props.path,changes)).data)
  },
 }:props
 return <details className="tool-catalog-tags-panel" onToggle={event=>setOpen(event.currentTarget.open)}>
  <summary>工具标签</summary>
  {open&&<PrivateTagSession key={scope} name={name} load={actions.load} save={actions.save}/>}
 </details>
}

function requireTags(value:TagSet|undefined|null):TagSet {
 if(!value||!Array.isArray(value.tags)||!Number.isInteger(value.revision))throw new Error('工具标签读取不完整。')
 return value
}

function PrivateTagSession({name,load,save}:{name:string;load:()=>Promise<TagSet>;save:(changes:TagChange)=>Promise<TagSet>}){
 const loader=useRef(load)
 const [current,setCurrent]=useState<TagSet|null>(null)
 const [reload,setReload]=useState(0)
 const [error,setError]=useState('')
 const [editing,setEditing]=useState(false)
 const [saved,setSaved]=useState(false)
 useEffect(()=>{
  let active=true
  setCurrent(null);setError('')
  void loader.current().then(requireTags).then(next=>{if(active)setCurrent(next)})
   .catch(cause=>{if(active)setError(cause instanceof Error?cause.message:'工具标签读取失败。')})
  return()=>{active=false}
 },[reload])
 function reloadTags(){
  setEditing(false);setSaved(false);setReload(value=>value+1)
 }
 return <section className="tool-catalog-tags" aria-label="私有工具标签">
  {error&&<div><p role="alert">{error}</p><button type="button" onClick={reloadTags}>重试读取标签</button></div>}
  {!error&&!current&&<p role="status">正在读取工具标签…</p>}
  {saved&&<p role="status">工具标签已保存。</p>}
  {current&&(editing?<TagEditor tool={{name,tags:current.tags}} onCancel={()=>setEditing(false)} onReload={reloadTags}
   save={async tags=>{
    const next=requireTags(await save({tags,expectedRevision:current.revision}))
    setCurrent(next);setEditing(false);setSaved(true)
   }}/>:<>
   {current.tags.length?<ul className="tool-catalog-tags-chips" aria-label="已添加标签">
    {current.tags.map(label=><li key={label}>{label}</li>)}
   </ul>:<p>暂无标签。</p>}
   <button type="button" onClick={()=>{setSaved(false);setEditing(true)}}>编辑标签</button>
  </>)}
 </section>
}
