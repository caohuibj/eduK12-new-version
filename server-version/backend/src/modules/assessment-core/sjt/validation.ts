import type { Issue,SjtDraftV2 } from './definition'
import { expandedSjtOptions } from './selection'

/** Fixed-scene SJT authoring bounds; no platform author-upload workflow is implied. */
export function validateSjtV2(d:SjtDraftV2,forPreview:boolean):Issue[] {
  const issues:Issue[]=[]
  const error=(path:string,message:string)=>issues.push({path,message,severity:'error'})
  const text=(value:string,path:string)=>{if(forPreview&&!value.trim())error(path,'请填写内容')}
  const unique=(keys:string[],path:string)=>{
    const seen=new Set<string>()
    keys.forEach((key,i)=>{if(seen.has(key))error(`${path}.${i}`,'标识重复，请使用新的稳定编码');seen.add(key)})
  }
  text(d.title,'title');text(d.author,'author');text(d.sourceNote,'sourceNote')
  if(forPreview){
    if(d.licenseStatus==='unknown')error('licenseStatus','必须明确内容原创或合法授权')
    if(d.redistribution!=='allowed')error('redistribution','公开呈现前必须确认允许展示与分发')
    if(!d.scenes.length)error('scenes','至少添加一个情境')
    if(!d.metrics.length)error('metrics','至少添加一个描述性维度')
    if(d.scoring.modelKey==='EXPERT_KEY'&&!d.scoring.sourceNote.trim())
      error('scoring.sourceNote','专家键必须说明评分键的来源和依据；跨题按均值计分')
  }
  unique(d.metrics.map(m=>m.metricKey),'metrics')
  d.metrics.forEach((m,i)=>text(m.label,`metrics.${i}.label`))
  unique(d.scenes.map(s=>s.sceneKey),'scenes')
  const questions=d.scenes.flatMap(s=>s.questions)
  unique(questions.map(q=>q.questionKey),'questions')
  if(questions.length>100)error('scenes','SJT 最多包含 100 道问题')
  const dimensions=new Set(d.metrics.map(m=>m.metricKey))
  let cells=0
  d.scenes.forEach((scene,si)=>{
    const path=`scenes.${si}`
    text(scene.title,path+'.title');text(scene.stimulus,path+'.stimulus')
    if(forPreview&&!scene.questions.length)error(path+'.questions','情境至少包含一道问题')
    if(forPreview&&scene.image&&(scene.image.rightsStatus==='unknown'||!scene.image.rightsNote.trim()))
      error(path+'.image','情境图片须明确版权或使用许可依据')
    scene.questions.forEach((q,qi)=>{
      const p=`${path}.questions.${qi}`
      text(q.prompt,p+'.prompt')
      unique(q.options.map(o=>o.optionKey),p+'.options')
      const substantive=q.options.filter(o=>!o.nonanswerReason)
      if(forPreview&&substantive.length<2)error(p+'.options','至少需要两个可计分选项；拒答或不适用不计入')
      if(q.exclusiveOptionKeys){
        unique(q.exclusiveOptionKeys,p+'.exclusiveOptionKeys')
        if(q.responseType!=='MULTIPLE')error(p+'.exclusiveOptionKeys','只有多选题可以配置互斥选项')
        for(const k of q.exclusiveOptionKeys)
          if(!q.options.some(o=>o.optionKey===k))error(p+'.exclusiveOptionKeys','互斥选项编码不存在')
      }
      if(q.responseType==='MULTIPLE'){
        if(!q.aggregationPolicy)error(p+'.aggregationPolicy','多选必须明确选择 SUM 或 MEAN')
        if(q.minSelections===undefined||q.maxSelections===undefined)
          error(p+'.minSelections','多选必须明确最少和最多选择数')
        const min=q.minSelections??1,max=q.maxSelections??substantive.length
        if(q.options.length>6||min>max||max>substantive.length)
          error(p+'.maxSelections','多选总选项最多 6 个，最少/最多选择须在可计分选项范围内')
        if(min>1&&q.exclusiveOptionKeys?.some(k=>q.options.some(o=>o.optionKey===k&&!o.nonanswerReason)))
          error(p+'.minSelections','有可计分互斥选项时最少选择必须为 1')
      }else if(q.aggregationPolicy!==undefined||q.minSelections!==undefined||q.maxSelections!==undefined)
        error(p,'单选题不得配置多选聚合或选择数量')
      q.options.forEach((o,oi)=>{
        const op=`${p}.options.${oi}`
        text(o.label,op+'.label')
        if(o.nonanswerReason){
          if(Object.keys(o.contributions).length)error(op+'.contributions','拒答或不适用不能填计分权重，不能补零')
        }else{
          for(const k of Object.keys(o.contributions))
            if(!dimensions.has(k))error(op+'.contributions','贡献引用了不存在的维度')
          if(forPreview)for(const m of d.metrics)
            if(!Object.prototype.hasOwnProperty.call(o.contributions,m.metricKey))
              error(op+'.contributions.'+m.metricKey,'每个可计分选项需显式填写全部维度贡献，可以为 0')
        }
      })
      // Enumerating at authoring time enforces the same subset budget as FINAL.
      if(q.options.length)try{
        const choices=expandedSjtOptions(q).filter(o=>!o.nonanswerReason)
        if(forPreview&&choices.length<2)error(p+'.options','至少需要两个合法计分选择或多选组合')
        cells+=choices.length*d.metrics.length
      }
      catch(e){error(p+'.options',e instanceof Error?e.message:'多选组合无效')}
    })
  })
  if(cells>16000)error('scenes','展开后的计分矩阵超过 16000 个贡献单元，请减少问题、维度或合法多选组合')
  return issues
}
