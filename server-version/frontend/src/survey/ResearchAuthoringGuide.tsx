import { useMemo } from 'react'
import type { FormDraft,ResearchDraft } from './builder.types'
import { authoringImportTemplate } from './authoring-import-template'
export function ResearchAuthoringGuide(){
  return <details className="survey-authoring-help"><summary>题型对照 · 选择合适的研究工具</summary>
    <table><caption className="text-left my-2">按要收集的信息选择工具，试答与正式提交分别确认。</caption>
      <thead><tr><th scope="col">工具</th><th scope="col">适用内容与录入方式</th></tr></thead><tbody>
        <tr><th scope="row">表单 Form</th><td>单选、多选、短文本、长文本、数值、Likert、矩阵；V2 还支持日期、时间、排序、滑块、恒定总和、矩阵多选。可逐题编辑或批量导入。</td></tr>
        <tr><th scope="row">量表 Scale</th><td>一组题目共用响应选项，配置维度与反向题。批量导入只添加题目，沿用已建立的选项与维度。</td></tr>
        <tr><th scope="row">情境判断 SJT</th><td>在情境材料下设置单选或受限多选及构念贡献。使用情境编辑器；此批量入口不导入 SJT。</td></tr>
        <tr><th scope="row">认知任务 Cognitive</th><td>使用受控任务模板与反馈设置。刺激、时钟及输入由原任务运行器管理；此批量入口不导入认知任务。</td></tr>
      </tbody></table>
    <p className="text-sm mt-3">矩阵单选是每行选一项，矩阵多选是每行选多项；排序填写顺序，恒定总和要求各项合计达到指定总数。</p>
  </details>
}
export function ResearchImportGuide({draft,onUse}:{draft:ResearchDraft;onUse:(csv:string)=>void}){
  const kind=draft.kind==='SCALE'?'SCALE':'FORM'
  const version=kind==='FORM'?(draft.definition as FormDraft).schemaVersion:1
  const template=useMemo(()=>authoringImportTemplate(kind,version),[kind,version])
  return <details className="survey-authoring-help"><summary>完整 CSV 导入模板与填写说明</summary>
    <p>{kind==='FORM'?'当前 Form V'+version+' 模板覆盖该版本的全部批量题型。':'量表模板包含正向题和反向题。请先建立共享选项和至少一个维度；dimension 留空时使用第一个维度。'}</p>
    <p className="text-sm">表头保持完整；每行一题，选项与矩阵行用 || 分隔。含逗号、换行或双引号的单元格须使用 CSV 引号规则。先解析预览，确认后才写入。</p>
    <label className="block text-sm my-3">完整 CSV 模板<textarea className="input block" readOnly rows={7} value={template}/></label>
    <button type="button" className="btn-secondary" onClick={()=>onUse(template)}>将完整模板填入导入框</button>
    <details className="mt-3 text-sm"><summary>字段与版本细节</summary>
      <p><code>required / reverse / integer_only</code> 使用 true 或 false；数值字段仅填数字。time_zone 支持 Asia/Shanghai 或 UTC。dimension 使用本工具已有维度编码，留空使用首维度。</p>
      <p>Form V1 不接受日期、时间、排序、滑块、恒定总和及矩阵多选；需先显式升级并保存 V2。SJT 与认知任务继续使用各自编辑器。</p>
    </details>
  </details>
}
