import type { Kind } from './builder.types'
const columns=['type','prompt','required','options','rows','dimension','reverse','min','max','step',
  'precision','total','min_selections','max_selections','integer_only','time_zone']
type Row=Record<string,string|number|boolean>
const csv=(value:unknown)=>'"'+String(value??'').replace(/"/g,'""')+'"'
/** Examples consume the existing server parser; no client parser or scorer. */
export function authoringImportTemplate(kind:Extract<Kind,'FORM'|'SCALE'>,version=1):string{
  const rows:Row[]=kind==='SCALE'?[
    {type:'LIKERT',prompt:'今天我能专注完成学习任务',required:true,reverse:false},
    {type:'LIKERT',prompt:'今天我容易分心',required:true,reverse:true},
  ]:[
    {type:'SINGLE',prompt:'今天的学习体验如何？',options:'顺利||一般||需要支持'},
    {type:'MULTIPLE',prompt:'使用了哪些学习方法？',options:'练习||讨论||阅读'},
    {type:'TEXT',prompt:'用一句话描述今天的收获'},
    {type:'LONG_TEXT',prompt:'可以分行说明收获，\n也可以填写包含“引号”的文字'},
    {type:'NUMBER',prompt:'今天专注学习多少分钟？',min:0,max:240,integer_only:true},
    {type:'LIKERT',prompt:'今天愿意主动提问',options:'不太符合||比较符合||非常符合'},
    {type:'MATRIX',prompt:'逐行评价学习体验',options:'不太符合||比较符合',rows:'课堂参与||学习信心'},
    ...(version===2?[
      {type:'DATE',prompt:'选择学习日期'},
      {type:'TIME',prompt:'选择学习开始时间',time_zone:'Asia/Shanghai'},
      {type:'RANK_ORDER',prompt:'按偏好排列学习方式',options:'阅读||讨论||练习'},
      {type:'SLIDER',prompt:'今天的专注程度',min:0,max:100,step:1,precision:0},
      {type:'CONSTANT_SUM',prompt:'分配100分钟的学习计划',options:'阅读||讨论||练习',total:100,integer_only:true},
      {type:'MATRIX_MULTIPLE',prompt:'逐行选择使用的方法',options:'阅读||讨论||练习',rows:'课前||课后'},
    ]:[]),
  ]
  return columns.join(',')+'\r\n'+rows.map(row=>columns.map(key=>csv(key==='required'?row[key]??true:row[key])).join(',')).join('\r\n')+'\r\n'
}
