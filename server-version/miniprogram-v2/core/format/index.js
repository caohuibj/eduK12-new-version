const { ApiError } = require('../errors/index')
const pad=n=>String(n).padStart(2,'0')
function timestamp(value) {
  if (!value) return '—'
  const date=new Date(value)
  if (!Number.isFinite(date.getTime())) return '时间无效'
  const minutes=-date.getTimezoneOffset(),absolute=Math.abs(minutes)
  const offset='UTC'+(minutes>=0?'+':'-')+Math.floor(absolute/60)+(absolute%60?':'+pad(absolute%60):'')
  return date.getFullYear()+'年'+(date.getMonth()+1)+'月'+date.getDate()+'日 '+pad(date.getHours())+':'+pad(date.getMinutes())+' '+offset
}
function parseTimestamp(value,label) {
  const m=typeof value==='string'&&value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/)
  const invalid=()=>new ApiError('invalidRequest',label+'请使用带时区的有效日期，例如 2026-10-30T18:00:00+09:00')
  if (!m) throw invalid()
  const [,year,month,day,hour,minute,second,zone]=m
  if (+year<1000||+month<1||+month>12||+day<1||+day>new Date(Date.UTC(+year,+month,0)).getUTCDate()||+hour>23||+minute>59||+(second||0)>59) throw invalid()
  if (zone!=='Z') {const [h,min]=zone.slice(1).split(':').map(Number);if(h>14||min>59||h===14&&min!==0)throw invalid()}
  const date=new Date(value)
  if (!Number.isFinite(date.getTime())) throw invalid()
  return date
}
function answerRows(questions,answers) {
  const list=Array.isArray(questions)?questions:[],used=new Set()
  const rows=list.map((q,index)=>{
    const key=String(q.id||index),value=answers?.[key]
    used.add(key)
    let shown=value==null||value===''?'未作答':String(value)
    if (['single_choice','multiple_choice'].includes(q.type)&&value!=null&&value!=='') {
      let values=Array.isArray(value)?value:null
      if (!values&&typeof value==='string'&&value.startsWith('[')) {try{const parsed=JSON.parse(value);if(Array.isArray(parsed))values=parsed}catch(_){}}
      values=values||(q.type==='multiple_choice'?String(value).split(','):[value])
      shown=values.map(raw=>{const option=(q.options||[]).find(o=>String(o.key??o.value)===String(raw));return option?.text||option?.label||String(raw)}).join('、')
    }
    const type={text:'主观题',single_choice:'单选题',multiple_choice:'多选题'}[q.type]
    return {label:'题目 '+(index+1)+(type?'（'+type+'）':'')+'：'+(q.question||q.title||''),value:shown}
  })
  for (const [key,value] of Object.entries(answers||{})) {
    if (!used.has(key)) rows.push({label:/^\d+$/.test(key)?'题目 '+(Number(key)+1):'未匹配题目',value:String(value)})
  }
  return rows
}
module.exports={timestamp,parseTimestamp,answerRows}
