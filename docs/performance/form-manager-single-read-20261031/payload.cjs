const {createHash}=require('node:crypto'); const {gzipSync}=require('node:zlib');
const sections = [
 {id:'context',title:'背景信息',position:0,contextSection:true,items:[{id:'context-field',label:'背景字段',formLabel:'背景字段',contextKey:'gradeLevel',position:0}]},
 ...[1,2].map(n=>({id:`section-${n}`,title:`分区${n}`,position:n,contextSection:false,items:Array.from({length:20},(_,i)=>({id:`field-${n}-${i}`,label:`合成字段 ${n}-${i}：请描述本次学习体验`,contextKey:null,sectionId:`section-${n}`,position:n*20+i,type:'text_input',formType:'text_input',required:true,options:null,placeholder:null,sectionPosition:i,formSectionPosition:i}))}))
];
const units=sections.map(s=>({type:'form-section',id:s.id,label:s.title,position:s.position,itemCount:s.items.length,contextSection:s.contextSection}));
const env=data=>({code:0,message:'成功',data});const measure=bodies=>({rawBytes:bodies.reduce((a,b)=>a+Buffer.byteLength(JSON.stringify(b)),0),gzipBodyBytes:bodies.reduce((a,b)=>a+gzipSync(JSON.stringify(b),{level:1}).length,0)});
console.log(JSON.stringify({scope:'Synthetic same HTTP fixture serialization; not production measurements or SQL count',fixtureSha256:createHash('sha256').update(JSON.stringify(sections)).digest('hex'),before:measure([env({list:sections}),env({units})]),after:measure([env({list:sections,units})]),fieldRows:41,units:3,note:'Units metadata remains alongside sections in both variants; combined response does not repeat full fields or add definition payloads.'},null,2));
