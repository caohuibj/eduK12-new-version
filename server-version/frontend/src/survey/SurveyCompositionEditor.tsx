import {useEffect,useState} from 'react'
import {ArrowDown,ArrowUp,Brain,Check,FileText,Layers,Plus,Route,Search,SlidersHorizontal,Trash2} from 'lucide-react'
import {toolLibraryApi as api,libraryKindLabel,type ToolRef} from './tool-library-api'
import type {CatalogGrant} from './ResearchCatalog'
import './survey-composition-studio.css'

const kinds=[
  {key:'SCALE',label:'量表',hint:'维度、计分与反馈',Icon:SlidersHorizontal},
  {key:'FORM',label:'表单',hint:'分页、题目与显示条件',Icon:FileText},
  {key:'COGNITIVE',label:'认知测验',hint:'选用已授权的固定版本',Icon:Brain},
  {key:'SJT',label:'情境判断',hint:'选用已授权的固定版本',Icon:Route},
] as const
type Candidate={id:string;title:string;kind:string;revision?:number;status?:string;sourceRef?:CatalogGrant['sourceRef']}

export function SurveyCompositionEditor({items,onChange}:{items:ToolRef[];onChange:(items:ToolRef[])=>void}){
  const [kind,setKind]=useState<typeof kinds[number]['key']>('SCALE')
  const [source,setSource]=useState<'owned'|'granted'>('owned'),[page,setPage]=useState(1)
  const [search,setSearch]=useState(''),[query,setQuery]=useState(''),[generation,setGeneration]=useState(0)
  const [result,setResult]=useState<{key:string;rows:Candidate[];total:number;hasMore:boolean}>({key:'',rows:[],total:0,hasMore:false})
  const [loading,setLoading]=useState(true),[error,setError]=useState('')
  const ownedAllowed=kind==='FORM'||kind==='SCALE'
  const requestKey=JSON.stringify([source,page,source==='owned'?kind:'',source==='owned'?query:'',generation])
  const requestPath=source==='owned'?'/tool-library?page='+page+'&kind='+kind+'&query='+encodeURIComponent(query):'/tool-library/catalog?page='+page
  useEffect(()=>{
    let current=true;setLoading(true);setError('')
    const request=api<{list:Candidate[];total?:number}>(requestPath)
    void request.then(data=>{if(current)setResult({key:requestKey,rows:data.list.filter(row=>kinds.some(k=>k.key===row.kind)),total:data.total??data.list.length,hasMore:data.total!==undefined?page*12<data.total:data.list.length===25})})
      .catch(cause=>{if(current)setError(cause instanceof Error?cause.message:'工具列表读取失败')})
      .finally(()=>{if(current)setLoading(false)})
    return()=>{current=false}
  },[requestKey,requestPath,page])
  const ready=!loading&&result.key===requestKey
  const rows=result.rows.filter(row=>row.kind===kind&&(source==='owned'||row.title.toLocaleLowerCase().includes(query.toLocaleLowerCase())))
  const add=(row:Candidate)=>{
    if(!ready||items.length>=20||items.some(item=>item.source===source&&item.id===row.id))return
    onChange([...items,{source,id:row.id,title:row.title,...(source==='owned'?{revision:row.revision}:{})}])
  }
  const move=(index:number,offset:number)=>{const next=[...items];[next[index],next[index+offset]]=[next[index+offset],next[index]];onChange(next)}
  const resetSearch=()=>{setPage(1);setSearch('');setQuery('')}
  return <div className="survey-composition-studio">
    <section className="survey-composition-catalog" aria-label="选择问卷工具">
      <header className="survey-composition-step"><span>01</span><div><h2>选择内容类型</h2><p>先选类型，再从自建或已授权的工具中添加。</p></div></header>
      <div className="survey-composition-types" role="group" aria-label="内容类型">{kinds.map(({key,label,hint,Icon})=><button type="button" key={key} aria-label={label} aria-pressed={kind===key} onClick={()=>{setKind(key);resetSearch();if(key==='COGNITIVE'||key==='SJT')setSource('granted')}}><Icon size={21} aria-hidden="true"/><span><strong>{label}</strong><small>{hint}</small></span></button>)}</div>
      <header className="survey-composition-step"><span>02</span><div><h2>选择{libraryKindLabel[kind]}</h2><p>{ownedAllowed?'添加时保留所选修订；修改工具后需重新选用。':'仅选用当前已获授权的原版内容，题目和计分保持只读。'}</p></div></header>
      <div className="survey-composition-filter">
        <div role="group" aria-label="工具来源"><button type="button" aria-pressed={source==='owned'} disabled={!ownedAllowed} title={!ownedAllowed?'此类型仅支持授权使用':undefined} onClick={()=>{setSource('owned');resetSearch()}}>我编制的</button><button type="button" aria-pressed={source==='granted'} onClick={()=>{setSource('granted');resetSearch()}}>已获授权</button></div>
        <form role="search" onSubmit={event=>{event.preventDefault();setQuery(search.trim());if(source==='owned')setPage(1)}}><Search size={16} aria-hidden="true"/><input aria-label={source==='owned'?'搜索自建工具':'搜索本页授权工具'} value={search} maxLength={200} placeholder={source==='owned'?'搜索工具名称':'筛选本页名称'} onChange={event=>setSearch(event.target.value)}/><button type="submit">检索</button></form>
      </div>
      {source==='granted'&&<p className="survey-composition-page-note">类型和名称仅筛选当前页授权目录，可翻页继续查找。</p>}
      {error?<div role="alert" className="survey-library-error">{error}<button type="button" className="btn-secondary" onClick={()=>setGeneration(value=>value+1)}>重新读取工具</button></div>:!ready?<p role="status" className="survey-composition-empty">正在读取工具…</p>:<>
        {!rows.length&&<div className="survey-composition-empty"><Layers size={26}/><h3>暂无可选{libraryKindLabel[kind]}</h3><p>{source==='owned'?'可先在工具集中编制并保存，或切换到“已获授权”。':'本页没有匹配项，可清空检索、翻页或向管理员确认授权。'}</p></div>}
        <div className="survey-composition-candidates">{rows.map(row=>{const included=items.some(item=>item.source===source&&item.id===row.id),unavailable=!!row.status&&row.status!==(source==='owned'?'DRAFT':'ACTIVE');return <article key={row.id}><div><h3>{row.title}</h3><p>{source==='owned'?'我编制的 · 修订 '+row.revision:'已获授权 · 版本 '+(row.sourceRef?.sourceVersion??'固定版本')}</p></div><button type="button" className="btn-secondary" disabled={included||items.length>=20||unavailable} aria-label={(included?'已添加：':'添加到问卷：')+row.title} onClick={()=>add(row)}>{included?<Check size={16}/>:<Plus size={16}/>}<span>{included?'已添加':'添加到问卷'}</span></button></article>})}</div>
      </>}
      <footer className="survey-composition-pagination"><button type="button" className="btn-secondary" disabled={!ready||page<=1} onClick={()=>setPage(value=>value-1)}>上一页</button><span>第 {page} 页{ready&&source==='owned'?' · 共 '+result.total+' 项':''}</span><button type="button" className="btn-secondary" disabled={!ready||!result.hasMore} onClick={()=>setPage(value=>value+1)}>下一页</button><button type="button" className="survey-composition-refresh" disabled={!ready} onClick={()=>setGeneration(value=>value+1)}>重新读取</button></footer>
    </section>
    <aside className="survey-composition-outline" aria-label="作答顺序">
      <header className="survey-composition-step"><span>03</span><div><h2>作答顺序</h2><p>从上到下依次呈现，使用箭头调整。</p></div><small aria-live="polite" aria-atomic="true">{items.length} / 20 项</small></header>
      {!items.length?<div className="survey-composition-empty"><Layers size={28}/><h3>从第一个工具开始</h3><p>添加后的工具会出现在这里，再按被试作答顺序排列。</p></div>:<ol>{items.map((item,index)=><li key={item.source+':'+item.id}><span className="survey-composition-position">{String(index+1).padStart(2,'0')}</span><div><strong>{item.title||'已选工具'}</strong><small>{item.source==='owned'?'我编制的 · 修订 '+item.revision:'已获授权 · 固定版本'}</small></div><div className="survey-composition-outline-actions"><button type="button" aria-label={'上移工具 '+(index+1)} disabled={index===0} onClick={()=>move(index,-1)}><ArrowUp size={16}/></button><button type="button" aria-label={'下移工具 '+(index+1)} disabled={index===items.length-1} onClick={()=>move(index,1)}><ArrowDown size={16}/></button><button type="button" aria-label={'移除工具 '+(index+1)} onClick={()=>onChange(items.filter((_,i)=>i!==index))}><Trash2 size={16}/></button></div></li>)}</ol>}
      {items.length>=20&&<p role="status" className="survey-composition-limit">已达到 20 项上限，移除一项后可继续添加。</p>}
      <div className="survey-composition-outline-note"><strong>各项分别计分与反馈</strong><p>保存后在研究的“发布与采集”中选用，再配置波次与反馈策略。</p></div>
    </aside>
  </div>
}
