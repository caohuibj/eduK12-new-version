import React, { useState } from 'react'
import { motGeometry, type MotCalibration as Calibration } from './generated/protocol'
import { readMotDisplay } from './display'

export function MotCalibration({language,onConfirm}:{language:'zh'|'en';onConfirm:(value:Calibration)=>void}){
  const en=language==='en',[reference,setReference]=useState(190),[distance,setDistance]=useState('350')
  const [confirmed,setConfirmed]=useState(false)
  const calibration=readMotDisplay(language,reference,Number(distance))
  const valid=Number.isFinite(Number(distance))&&Number(distance)>=100&&Number(distance)<=2000
  const geometry=valid?motGeometry(calibration,window.innerWidth-28,window.innerHeight-242):null
  return <section className="mot-intro">
    <h1>{en?'Set up your viewing distance':'确认屏幕尺寸和观看距离'}</h1>
    <p>{en?'Place the device on a stable surface. Use a physical ruler to adjust the line to exactly 5 cm. Then measure the distance from your eyes to the screen.':'请把设备放稳。用实体尺子测量下方线段，调到正好5厘米，再测量眼睛到屏幕的距离。'}</p>
    <div className="mot-ruler" style={{width:reference}} aria-hidden="true"/>
    <label>{en?'Adjust the 5 cm line':'调整5厘米线段'}<input type="range" min="50" max="360" step="0.5" value={reference}
      onChange={e=>{setReference(Number(e.target.value));setConfirmed(false)}}/></label>
    <label>{en?'Eye-to-screen distance (mm)':'眼睛到屏幕的距离（毫米）'}<input type="number" min="100" max="2000"
      value={distance} onChange={e=>{setDistance(e.target.value);setConfirmed(false)}} inputMode="numeric"/></label>
    <label className="mot-check"><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/>
      {en?'I measured both values and will keep this distance.':'我已实际测量，并会保持这个观看距离。'}</label>
    <p className="mot-small">{en?'This is a self-reported calibration. Keep the device, orientation, browser zoom and viewing distance unchanged during the task.':'这是自行测量的校准。任务中请保持设备、方向、浏览器缩放和观看距离不变。'}</p>
    {geometry&&!geometry.fits&&<p role="alert">{en?'The required display does not fit. We will not shrink it automatically. Use a larger screen or remeasure an appropriate viewing distance.':'当前屏幕容纳不下所需区域，不会自动缩小。请改用更大的屏幕，或重新测量合适的观看距离。'}</p>}
    {!valid&&<p role="alert">{en?'Enter a measured distance between 100 and 2000 mm.':'请输入100至2000毫米之间的实测距离。'}</p>}
    <button className="mot-button" disabled={!valid||!confirmed||!geometry?.fits} onClick={()=>onConfirm(calibration)}>
      {en?'Confirm setup':'确认校准'}</button>
  </section>
}
