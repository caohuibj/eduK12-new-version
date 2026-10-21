import {useState} from 'react'
import {Copy} from 'lucide-react'
import './training-course-management.css'
export default function TrainingCourseCode({code,title,compact=false}:{code:string;title:string;compact?:boolean}){
 const [notice,setNotice]=useState('')
 async function copy(){
  if(!navigator.clipboard?.writeText){setNotice('当前设备无法自动复制，可手动选中课程码。');return}
  try{await navigator.clipboard.writeText(code);setNotice('课程码已复制。')}catch{setNotice('复制失败，请手动选中课程码。')}
 }
 if(!code)return null
 return <div className={`training-inline-course-code${compact?' is-compact':''}`} role="group" aria-label={`${title}的课程码`}><small>{compact?'课程码':'课程码 · 邀请学员'}</small><div><code>{code}</code><button type="button" onClick={()=>void copy()} aria-label={`复制「${title}」课程码`}><Copy size={15} aria-hidden="true"/>复制</button></div>{notice&&<p role="status">{notice}</p>}</div>
}
