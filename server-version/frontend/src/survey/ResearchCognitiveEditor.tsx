import type { CognitiveDraft } from './builder.types'
export function ResearchCognitiveEditor({value,onChange}:{value:CognitiveDraft;onChange:(next:CognitiveDraft)=>void}){
  const feedback=value.feedback??{mode:'GENERAL',metricKeys:[],release:'AFTER_FINAL'}
  return <section className="border rounded-xl p-4 space-y-4" aria-label="受控认知任务目录">
    <h3 className="font-semibold">认知任务 · Go/No-Go</h3>
    <p className="text-sm">注意与反应抑制的工程试点模板（PILOT）。需桌面／笔记本电脑和实体键盘；不是临床诊断，不提供常模或能力等级。</p>
    <label className="block text-sm">任务模板<select className="input block w-full" value={value.templateKey} onChange={()=>{}}>
      <option value="gonogo-software-frame-v1">Go/No-Go · software-frame-v1</option></select></label>
    <dl className="text-sm grid sm:grid-cols-2 gap-2">
      <div><dt className="font-medium">固定协议</dt><dd>120 个正式试次；25% No-Go；刺激 800 ms、间隔 500 ms</dd></div>
      <div><dt className="font-medium">精确版本</dt><dd>引擎 1.0.0／计分 1.0.0／配置 1.1.0</dd></div>
      <div><dt className="font-medium">恢复策略</dt><dd>未封存中断后整个单元重做，最多一次；已提交不能重做</dd></div>
      <div><dt className="font-medium">时间依据</dt><dd>正式序列计划约 2 分 36 秒，说明和练习另计；软件帧观测不能认证屏幕物理延迟</dd></div>
    </dl>
    <p className="text-xs text-slate-600">研究链接内完成练习及正式任务。开始认知前冻结影响路径的前置答案。受控几何刺激无需作者上传材料；本模板固定参数，不接受脚本或实验 JSON。</p>
    <h4 className="font-semibold">完成后反馈</h4>
    <label className="block text-sm">反馈内容<select className="input block w-full" value={feedback.mode}
      onChange={e=>onChange({...value,feedback:{...feedback,mode:e.target.value as CognitiveDraft['feedback']['mode'],metricKeys:e.target.value==='GENERAL'?[]:feedback.metricKeys}})}>
      <option value="GENERAL">GENERAL：只提供本轮提交回执与感谢说明</option><option value="DESCRIPTIVE">受控描述性反馈</option></select></label>
    {feedback.mode==='DESCRIPTIVE'&&<>
      <p className="text-sm">仅说明本次施测条件下的表现。参与者只接收服务端批准的指标，不接收评分键、原始试次或随机种子。</p>
      {([{key:'hitRate',label:'Go 命中率（比例）'},{key:'goMedianRtMs',label:'正确 Go 反应中位时长（ms）'}] as const).map(m=><label key={m.key} className="block text-sm">
        <input type="checkbox" checked={feedback.metricKeys.includes(m.key)} onChange={e=>onChange({...value,feedback:{...feedback,metricKeys:e.target.checked?[...feedback.metricKeys,m.key]:feedback.metricKeys.filter(k=>k!==m.key)}})}/> {m.label}</label>)}
      <label className="block text-sm">开放时机<select className="input block w-full" value={feedback.release} onChange={e=>onChange({...value,feedback:{...feedback,release:e.target.value as CognitiveDraft['feedback']['release']}})}>
        <option value="AFTER_FINAL">整轮研究提交后</option><option value="AFTER_COLLECTION">本轮统一收集结束后</option></select></label>
      <p className="text-xs text-slate-600">任务单独完成不会开放结果；指标不可计算或质量受限时按服务端投影显示。配置随研究发布冻结。</p>
    </>}
  </section>
}
