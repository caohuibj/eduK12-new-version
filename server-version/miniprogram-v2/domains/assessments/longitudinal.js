const {ApiError}=require('../../core/errors/index')
const finite=v=>typeof v==='number'&&Number.isFinite(v)
function longitudinal(raw){
 if(raw?.schemaVersion!==1||raw.kind!=='MY_LONGITUDINAL'||!Array.isArray(raw.waves)||!Array.isArray(raw.comparisons))throw new ApiError('invalidResponse','纵向报告格式无效')
 const blocks=[],series=[],keys=[...new Set(raw.waves.flatMap(w=>Object.keys(w.metrics||{})))],states={PILOT:'试点证据',RESEARCH_READY:'研究可用证据',RESEARCH_GRADE:'研究级证据'}
 for(const key of keys){const points=raw.waves.map(w=>({ordinal:w.ordinal,value:w.metrics[key]?.state==='present'&&finite(w.metrics[key].value)?w.metrics[key].value:null}));series.push({key,title:'指标 '+key,points})
  blocks.push({title:'指标 '+key,text:raw.waves.map(w=>'第 '+w.ordinal+' 次：'+(w.metrics[key]?.state==='present'&&finite(w.metrics[key].value)?String(w.metrics[key].value):'未提供可用值')+'（'+(states[w.evidenceLevel]||'服务器未标注证据级别')+'）').join('\n')})
  for(const pair of raw.comparisons){const metric=pair.metrics?.[key];if(!metric)continue;blocks.push({title:'第 '+pair.fromOrdinal+' 次至第 '+pair.toOrdinal+' 次',text:'服务器可比性：'+String(metric.comparability)+(finite(metric.delta)?'；服务器提供的变化值：'+metric.delta:'；未提供可披露的变化值')})}
  const reference=raw.referenceTrajectories?.metrics?.[key];if(reference?.points)blocks.push({title:'参考版本 · '+key,text:(reference.unified?'服务器确认统一参考版本。':'参考版本未统一。')+'\n'+reference.points.map(p=>'第 '+p.ordinal+' 次：'+(p.referenceVersion||'未提供参考版本')+(p.bandLabel?' · '+p.bandLabel:'')).join('\n')})
 }
 for(const text of raw.limitations||[])if(typeof text==='string')blocks.push({title:'阅读限制',text})
 return {title:'我的纵向报告',blocks:blocks.map((b,key)=>({...b,key:String(key)})),series,description:'仅展示服务器允许的波次、可比性和变化值。图中的缺失点保持空缺。'}
}
// Display geometry only. Never interpolates missing waves or computes scores/deltas.
function geometry(points,width=280,height=160){const values=points.filter(p=>finite(p.value)).map(p=>p.value);if(!values.length)return {points:[],min:null,max:null};const min=Math.min(...values),max=Math.max(...values),span=max-min||1,count=points.length;return {min,max,points:points.map((p,i)=>({...p,x:24+(count===1?0.5:i/(count-1))*(width-48),y:finite(p.value)?height-24-((max===min?0.5:(p.value-min)/span)*(height-48)):null}))}}
module.exports={longitudinal,geometry}
