import React, { useRef, useState } from 'react'
import { projectMotReport, type MotPublicResult, type MotProfile } from './generated/protocol'

/** All visible/exported content comes from the same gated projection as the text report. */
export function MotTakeHome({result,profile,language='zh'}:{result:MotPublicResult;profile:MotProfile;language?:'zh'|'en'}){
  const model=projectMotReport(result),en=language==='en',svg=useRef<SVGSVGElement>(null)
  const [failed,setFailed]=useState(false)
  const number=(v:number)=>new Intl.NumberFormat(en?'en':'zh-CN',{maximumFractionDigits:1}).format(v)
  const title=model.state==='invalid'?(en?'No performance conclusion this time':'本次暂不提供表现结论'):
    model.state==='limited'?(en?'Some speed records are available':'部分速度的记录可以查看'):
    model.headline===null?(en?'This round’s available records':'这轮可查看的记录'):
    en?'This round: '+number(model.headline)+' / 5 targets':'这轮平均每次找回 '+number(model.headline)+' / 5 个'
  const description=model.state==='invalid'?(en?'Key records were incomplete. You can try again later.':'关键记录不完整，可稍后在稳定环境中重试。'):
    model.state==='limited'?(en?'Affected conditions and the overall average are hidden.':'已隐藏受影响条件及整体均值。'):
    en?'A record of this task, not a daily-life ability score.':'这只是本轮记录，不代表日常能力。'
  const labels=en?{1:'Slow',4:'Medium',8:'Fast'}:{1:'慢速',4:'中速',8:'快速'}
  const rows=model.rows.map(row=>labels[row.speed]+'  '+number(row.mean)+'/5   '+(en?'valid ':'有效 ')+row.validTrials+'/'+row.totalTrials)
  const caveat=model.state==='invalid'?(en?'Keep the device still and reduce interruptions.':'把设备放稳，减少中断后再尝试。'):
    profile==='experience'?(en?'Experience: only 3 trials per speed; no norms.':'体验版：每速度仅3次；暂无适用常模。'):
    en?'Literature-aligned project version; no norms.':'文献对照的本项目实现；暂无适用常模。'
  async function download(){
    if(!svg.current)return
    setFailed(false)
    const url=URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(svg.current)],{type:'image/svg+xml;charset=utf-8'}))
    try{
      const img=new Image();img.src=url;await img.decode()
      const canvas=document.createElement('canvas');canvas.width=960;canvas.height=540
      const ctx=canvas.getContext('2d');if(!ctx)throw new Error('Canvas is unavailable')
      ctx.drawImage(img,0,0,canvas.width,canvas.height)
      const png=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('PNG is unavailable')),'image/png'))
      const target=URL.createObjectURL(png),link=document.createElement('a')
      link.href=target;link.download='mot-'+profile+'-take-home.png';link.click()
      // Give the browser time to consume the local download URL, without a network call.
      window.setTimeout(()=>URL.revokeObjectURL(target),1000)
    }catch{setFailed(true)}finally{URL.revokeObjectURL(url)}
  }
  return <figure className="mot-takehome">
    <svg ref={svg} xmlns="http://www.w3.org/2000/svg" width="480" height="270" viewBox="0 0 480 270"
      role="img" aria-label={title+'。'+description+' '+rows.join('；')+'。'+caveat}
      style={{fontFamily:'system-ui, sans-serif',background:'#FFFFFF'}}>
      <rect x="1" y="1" width="478" height="268" rx="12" fill="#FFFFFF" stroke="#CBD5E1"/>
      <text x="24" y="30" fill="#4B5563" fontSize="12">{en?'MULTIPLE OBJECT TRACKING · THIS ATTEMPT':'多目标追踪 · 本次记录'}</text>
      <text x="24" y="65" fill="#1F2937" fontSize="20" fontWeight="600">{title}</text>
      <text x="24" y="94" fill="#4B5563" fontSize="13">{description}</text>
      {rows.map((row,i)=><text key={i} x="24" y={126+i*25} fill="#1F2937" fontSize="14">{row}</text>)}
      <text x="24" y="220" fill="#4B5563" fontSize="12">{caveat}</text>
      <text x="24" y="247" fill="#1D4ED8" fontSize="14" fontWeight="700">EDUK12.TOP</text>
    </svg>
    <button className="mot-button mot-button-secondary" onClick={()=>void download()}>{en?'Save this small summary':'保存这张小结图'}</button>
    {failed&&<figcaption role="status">{en?'The image could not be saved. You can still read the summary here.':'图片暂时无法保存，仍可在此阅读小结。'}</figcaption>}
  </figure>
}
