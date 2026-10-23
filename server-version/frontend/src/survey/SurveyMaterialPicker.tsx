import {useEffect,useState} from 'react'
import {toolLibraryApi as api} from './tool-library-api'
import type {AssessmentMaterial} from '../modules/assessment-media/material'
import './survey-material-picker.css'

type Row={id:string;name:string;mimeType:AssessmentMaterial['asset']['mimeType'];contentHash:string;size:number}
export function SurveyMaterialPicker({value=[],onChange,label='展示素材'}:{value?:AssessmentMaterial[];onChange:(items:AssessmentMaterial[])=>void;label?:string}){
  const [open,setOpen]=useState(false),[kind,setKind]=useState('all'),[page,setPage]=useState(1),[reload,setReload]=useState(0)
  const [rows,setRows]=useState<Row[]>([]),[total,setTotal]=useState(0),[loading,setLoading]=useState(false),[error,setError]=useState('')
  useEffect(()=>{
    if(!open)return
    let current=true;setLoading(true);setError('');setRows([])
    void api<{list:Row[];total:number}>('/media-library?source=owned&kind='+kind+'&page='+page).then(result=>{if(current){setRows(result.list);setTotal(result.total)}}).catch(cause=>{if(current)setError(cause.message)}).finally(()=>{if(current)setLoading(false)})
    return()=>{current=false}
  },[open,kind,page,reload])
  const update=(index:number,patch:Partial<AssessmentMaterial>)=>onChange(value.map((item,i)=>i===index?{...item,...patch}:item))
  return <section className="survey-material-picker" aria-label={label}>
    <header><div><strong>{label}</strong><p>{label==='反馈展示素材'?'图片、视频、PDF · 在对应反馈区间获准开放后展示，不影响计分。':'图片、视频、PDF · 按顺序在工具开始前展示，阅读不参与计分。组合问卷保留所选工具的素材。'}</p></div><button type="button" className="btn-secondary" aria-expanded={open} onClick={()=>setOpen(!open)}>{open?'收起素材库':'从素材库添加'}</button></header>
    {open&&<div className="survey-material-picker-browser">
      <div className="survey-material-picker-filters"><label>素材类型<select className="input" value={kind} onChange={e=>{setKind(e.target.value);setPage(1)}}><option value="all">全部</option><option value="image">图片</option><option value="video">视频</option><option value="document">PDF 文档</option></select></label><a href="/workspace/media" target="_blank" rel="noopener noreferrer">在素材库上传或管理 ↗</a></div>
      <p className="survey-material-picker-note">仅列出你可复用的私有素材；随授权量表提供的附件仍限原量表使用。</p>
      {loading?<p role="status">正在读取素材…</p>:error?<div role="alert">{error}<button type="button" className="btn-secondary" onClick={()=>setReload(x=>x+1)}>重新读取</button></div>:<>
        {!rows.length&&<p role="status">没有符合条件的素材。可切换类型，或到素材库上传后重新读取。</p>}
        <ul>{rows.map(row=>{const selected=value.some(item=>item.asset.assetId===row.id);return <li key={row.id}><div><strong>{row.name}</strong><small>{row.mimeType.startsWith('image/')?'图片':row.mimeType.startsWith('video/')?'视频':'PDF'} · {row.size<1024*1024?Math.max(1,Math.round(row.size/1024))+' KB':(row.size/1024/1024).toFixed(1)+' MB'}</small></div><button type="button" className="btn-secondary" disabled={selected||value.length>=10} onClick={()=>onChange([...value,{asset:{assetId:row.id,contentHash:row.contentHash,mimeType:row.mimeType},name:row.name,rightsStatus:'unknown',rightsNote:''}])}>{selected?'已添加':'添加'}</button></li>})}</ul>
        <footer><button type="button" className="btn-secondary" disabled={page<=1} onClick={()=>setPage(page-1)}>上一页</button><span>第 {page} 页 · {total} 项</span><button type="button" className="btn-secondary" disabled={page*9>=total} onClick={()=>setPage(page+1)}>下一页</button><button type="button" className="btn-secondary" onClick={()=>setReload(x=>x+1)}>重新读取</button></footer>
      </>}
    </div>}
    {!!value.length&&<ol className="survey-material-picker-selected">{value.map((item,index)=><li key={item.asset.assetId}>
      <div className="survey-material-picker-row"><strong>{index+1}. {item.name}</strong><div><button type="button" disabled={!index} onClick={()=>{const next=[...value];[next[index-1],next[index]]=[next[index],next[index-1]];onChange(next)}}>上移</button><button type="button" disabled={index===value.length-1} onClick={()=>{const next=[...value];[next[index+1],next[index]]=[next[index],next[index+1]];onChange(next)}}>下移</button><button type="button" onClick={()=>onChange(value.filter((_,i)=>i!==index))}>移除</button></div></div>
      <label>展示名称／图片替代文字<input className="input" value={item.name} maxLength={300} onChange={e=>update(index,{name:e.target.value})}/></label>
      <label>素材说明（可选）<input className="input" value={item.caption??''} maxLength={1000} onChange={e=>update(index,{caption:e.target.value})}/></label>
      <div className="survey-material-picker-rights"><label>使用依据<select className="input" value={item.rightsStatus} onChange={e=>update(index,{rightsStatus:e.target.value as AssessmentMaterial['rightsStatus']})}><option value="unknown">待确认（不能完成编制）</option><option value="self_authored">本人原创</option><option value="authorized">已取得本次展示授权</option></select></label><label>原创／授权说明<input className="input" value={item.rightsNote} maxLength={2000} onChange={e=>update(index,{rightsNote:e.target.value})}/></label></div>
    </li>)}</ol>}
    {value.length>=10&&<p role="status">每处最多 10 个展示素材。</p>}
  </section>
}
