import type {ReactNode} from 'react'
export type ReportReferenceKind='normative_distribution'|'criterion_threshold'|'descriptive_sample'|'theoretical_range'
export type ReportTemplateBlock={type:'TEXT';text:string}|{type:'METRIC';metricKey:string;label?:string;display:'RAW'|'REFERENCE_RESULT'}
  |{type:'REFERENCE_BAND';metricKey:string;referenceKind:ReportReferenceKind;bandKey:string;text:string;guidance:string[]}
  |{type:'ASSET';assetId:string;alt:string}|{type:'CHART';metricKeys:string[];style:'BAR'|'TABLE';caption?:string}
export type ReportTemplateDefinition={title?:string;blocks:ReportTemplateBlock[];limitations:string[];disclaimer?:string}

const referenceLabels:Record<ReportReferenceKind,string>={normative_distribution:'常模分布',criterion_threshold:'准则阈值',descriptive_sample:'描述样本',theoretical_range:'理论范围'}
function ReportBlockPanel({plain,plainTitle,expanded,onExpand,heading,children}:{plain:boolean;plainTitle:string;expanded:boolean;onExpand:()=>void;heading:ReactNode;children:ReactNode}){
  if(plain)return <><strong>{plainTitle}</strong>{children}</>
  return <details className="survey-report-block" open={expanded} onToggle={event=>{if(event.currentTarget.open)onExpand()}}><summary className="survey-report-block-heading">{heading}</summary>{children}</details>
}

export function ReportTemplateFields({template,metricKeys,onChange,plain=true,expandedBlock=0,onExpandedBlockChange=()=>{}}:{template:ReportTemplateDefinition;metricKeys:string[];onChange:(template:ReportTemplateDefinition)=>void;plain?:boolean;expandedBlock?:number|null;onExpandedBlockChange?:(index:number)=>void}){
 const replaceBlock=(index:number,block:ReportTemplateBlock)=>onChange({...template,blocks:template.blocks.map((value,i)=>i===index?block:value)})
 const addBlock=(type:'TEXT'|'METRIC'|'REFERENCE_BAND')=>{
  const metricKey=metricKeys[0]||''
  const block:ReportTemplateBlock=type==='TEXT'?{type,text:'新段落'}:type==='METRIC'?{type,metricKey,display:'RAW'}:{type,metricKey,referenceKind:'descriptive_sample',bandKey:'',text:'',guidance:[]}
  onExpandedBlockChange(template.blocks.length);onChange({...template,blocks:[...template.blocks,block]})
 }
 return <>          <p>可引用指标：{metricKeys.join('、')}。测量身份与指标集合随此草稿固定。</p>
          {template.blocks.map((block,index)=><article key={index} className="border rounded p-3 space-y-2" aria-label={'报告区块 '+(index+1)}>
            <ReportBlockPanel plain={plain} plainTitle={'区块 '+(index+1)+' · '+block.type} expanded={expandedBlock===index} onExpand={()=>onExpandedBlockChange(index)} heading={<><strong>区块 {index+1} · {plain?block.type:{TEXT:'文字段落',METRIC:'研究指标',REFERENCE_BAND:'参考解释',ASSET:'素材',CHART:'图表'}[block.type]}</strong><span className="survey-workflow-status">{['TEXT','METRIC','REFERENCE_BAND'].includes(block.type)?(plain?'可编辑':'点击编辑'):'只读保留'}</span><span className="survey-report-block-snippet">{block.type==='TEXT'?block.text:block.type==='METRIC'?(block.label||block.metricKey):block.type==='REFERENCE_BAND'?(block.text||block.metricKey):block.type==='ASSET'?block.alt:block.caption||'图表区块'}</span></>}><div className="survey-report-block-body">
            {block.type==='TEXT'?<label className="block">段落文字<textarea className="input block w-full" value={block.text} onChange={e=>replaceBlock(index,{...block,text:e.target.value})}/></label>:
              block.type==='METRIC'||block.type==='REFERENCE_BAND'?<>
                <label className="block">指标<select className="input block" value={block.metricKey} onChange={e=>replaceBlock(index,{...block,metricKey:e.target.value})}>{metricKeys.map(key=><option key={key} value={key}>{key}</option>)}</select></label>
                {block.type==='METRIC'?<><label className="block">指标显示名称<input className="input block" value={block.label||''} onChange={e=>replaceBlock(index,{...block,label:e.target.value||undefined})}/></label>
                  <p>显示：{block.display==='RAW'?'原始计分事实':'既有参考结果（保留原配置）'}；此处不能修改计分规则。</p></>:<>
                  <label className="block">参考类型<select className="input block" value={block.referenceKind} onChange={e=>replaceBlock(index,{...block,referenceKind:e.target.value as ReportReferenceKind})}>{Object.entries(referenceLabels).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label>
                  <label className="block">参考分段标识<input className="input block" maxLength={240} value={block.bandKey} onChange={e=>replaceBlock(index,{...block,bandKey:e.target.value})}/></label>
                  <p className="text-sm">填写已批准参考规则的精确分段标识；合成预览不证明真实参考存在或适用。</p>
                  <label className="block">匹配时显示的文字<textarea className="input block w-full" value={block.text} onChange={e=>replaceBlock(index,{...block,text:e.target.value})}/></label>
                  <label className="block">建议（每行一条）<textarea className="input block w-full" value={block.guidance.join('\n')} onChange={e=>replaceBlock(index,{...block,guidance:e.target.value.split('\n')})}/></label>
                </>}
              </>:<p>此 {block.type} 区块在当前编辑器中只读，保存和复制会原样保留。</p>}
            {(block.type==='TEXT'||block.type==='METRIC'||block.type==='REFERENCE_BAND')&&<button type="button" className="btn-secondary" onClick={()=>{onExpandedBlockChange(0);onChange({...template,blocks:template.blocks.filter((_,i)=>i!==index)})}}>删除区块 {index+1}</button>}
          </div></ReportBlockPanel></article>)}
          <div className="survey-report-add-blocks flex flex-wrap gap-2"><span>添加内容</span><button type="button" className="btn-secondary" onClick={()=>addBlock('TEXT')}>添加文字段落</button>
            <button type="button" className="btn-secondary" onClick={()=>addBlock('METRIC')}>添加指标</button><button type="button" className="btn-secondary" onClick={()=>addBlock('REFERENCE_BAND')}>添加参考解释</button></div>
          <label className="block">局限说明（每行一条）<textarea className="input block w-full" value={template.limitations.join('\n')} onChange={e=>onChange({...template,limitations:e.target.value.split('\n')})}/></label>
          <label className="block">免责声明<textarea className="input block w-full" value={template.disclaimer||''} onChange={e=>onChange({...template,disclaimer:e.target.value||undefined})}/></label>
</>
}
