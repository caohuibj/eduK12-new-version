import React,{useEffect,useState} from 'react'
import {enumerationGeometry,readEnumerationViewport,type EnumerationCalibration as Calibration,type EnumerationRecipe} from './display'
import './enumeration.css'
/** Existing 5 cm ruler + self-reported viewing distance; no claim of physical timing or hardware validation. */
export function EnumerationCalibration({recipe,onConfirm}:{recipe:EnumerationRecipe;onConfirm:(value:Calibration)=>Promise<void>}){
 const [reference,setReference]=useState(190),[distance,setDistance]=useState(''),[confirmed,setConfirmed]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('')
 const [viewport,setViewport]=useState(readEnumerationViewport)
 useEffect(()=>{const changed=()=>{setViewport(readEnumerationViewport());setConfirmed(false)};window.addEventListener('resize',changed);window.visualViewport?.addEventListener('resize',changed);return()=>{window.removeEventListener('resize',changed);window.visualViewport?.removeEventListener('resize',changed)}},[])
 const positive=Number.isFinite(Number(distance))&&Number(distance)>0
 const calibration:Calibration={id:'pending-not-calibrated',source:'self_reported_ruler_and_distance',referenceMm:50,referenceCssPx:reference,
  viewingDistanceMm:Number(distance),viewportWidthCssPx:viewport.width,viewportHeightCssPx:viewport.height,devicePixelRatio:viewport.dpr,visualViewportScale:viewport.scale}
 const geometry=positive?enumerationGeometry(calibration,recipe):null
 const fits=Boolean(geometry&&geometry.fieldCssPx+2<=viewport.width-40&&geometry.fieldCssPx+2<=viewport.height-300&&Math.ceil(geometry.fieldCssPx*viewport.dpr)<=4096)
 return <section className="enumeration-candidate"><section className="enum-reading"><h1>确认屏幕尺寸和观看距离</h1>
  <p>请把设备放稳。用实体尺子测量下方线段，调到正好5厘米，再测量眼睛到屏幕的距离。</p>
  <div style={{width:reference,height:14,border:'solid #1F2937',borderWidth:'0 2px 2px',margin:'28px 0'}} aria-hidden="true"/>
  <label>调整5厘米线段<input type="range" min="50" max="360" step="0.5" value={reference} onChange={e=>{setReference(Number(e.target.value));setConfirmed(false)}}/></label>
  <label>眼睛到屏幕的距离（毫米）<input type="number" inputMode="decimal" value={distance} onChange={e=>{setDistance(e.target.value);setConfirmed(false)}}/></label>
  <label><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/>我已实际测量，并会保持这个观看距离。</label>
  <p>这是自行测量的设置。任务中请保持设备、方向、浏览器缩放和观看距离不变。</p>
  {positive&&!fits&&<p role="alert">当前屏幕容纳不下所需区域，不会自动缩小。请改用更大的屏幕，或重新测量合适的观看距离。</p>}
  {error&&<p role="alert">{error}</p>}
  <button disabled={!positive||!confirmed||!fits||busy} onClick={()=>{setBusy(true);setError('');void onConfirm({...calibration,id:crypto.randomUUID()}).catch(e=>setError(e instanceof Error?e.message:'设置尚未保存')).finally(()=>setBusy(false))}}>{busy?'正在保存设置…':'确认校准'}</button>
 </section></section>
}
