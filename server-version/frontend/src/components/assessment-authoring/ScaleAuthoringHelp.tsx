import { CircleHelp } from 'lucide-react'
import './scale-authoring-help.css'

type Section = 'basic' | 'responses' | 'items' | 'scores' | 'report'
const help: Record<Section, { title: string; intro: string; points: Array<[string, string]> }> = {
  basic: {
    title: '基本信息怎么填写？',
    intro: '首次编制建议按上方 1—5 的顺序完成。先保存基本信息，再录入题目、设置选项、计分和报告文案。',
    points: [
      ['说明与作答指导', '说明介绍量表的用途；作答指导告诉作答者如何选择，例如“请根据最近两周的实际情况回答”。'],
      ['预计用时与可见性', '用时填写完成整份量表预计需要的分钟数。可见性控制展示范围，不代替课程投放或使用授权。'],
      ['怎么保存', '“保存基本信息”只保存本区；其他分区的保存按钮保存题目、计分及报告定义。“保存草稿”可一并保存已应用的编辑。'],
      ['保存后怎样使用', '编制完成后先运行发布检查，再发布自用。发布后当前版本冻结；后续课程或问卷还需明确选用该版本。'],
    ],
  },
  responses: {
    title: '响应选项怎么设置？',
    intro: '录入题目后，在这里设置作答者看到的选项文字，以及每个选项对应的分值，再进入计分。',
    points: [
      ['快速录入', '可选择常用选项，或粘贴文字，每行一个选项；点击“应用选项文字”后，核对下方列表并保存。'],
      ['文字与分值分开看', '修改文字会保留同序选项原有分值；新增选项的分值顺延。请核对实际分值，不要只看选项排列。'],
      ['与题目的关系', '同一组选项可供多道题共用。修改共用选项会影响引用它的题目；已有其他选项组会保留。'],
      ['反向题放在哪里', '反向计分在“题目”中单独设置，无需为反向题再建一组倒序选项。'],
    ],
  },
  items: {
    title: '题目怎么录入？',
    intro: '可逐题新增，也可一次粘贴多道题。批量内容需先追加到列表，才会进入待保存的量表定义。',
    points: [
      ['每行一道题', '直接粘贴题干，不必自行填写系统标识。追加后题号自动排列，默认必答、正向计分。'],
      ['怎样标记反向题', '在题干首尾加 [反向] 或 (R)，或在题目卡片中勾选“反向计分”。题目文字本身不会判断是否反向。'],
      ['辅助题的用途', '注意力题和社会赞许性题仅采集、导出原始作答，不自动纳入总分、维度分或系统质量判断。'],
      ['录完之后做什么', '保存题目，到“响应选项”核对文字与分值，再到“计分”选择哪些题纳入总分或各个维度。新增题目不会自动加入已有计分项。'],
    ],
  },
  scores: {
    title: '计分怎么设置？',
    intro: '每个总分或维度都是一个计分项。先添加计分项，再选择参与的题目、计算方式与显示名称。',
    points: [
      ['总分与维度', '总分用于汇总选定题目；维度用于汇总某一方面的题目。新增计分项默认不选题，请点击下方题目卡片纳入。'],
      ['求和还是平均', '求和把选中题目的分数相加；平均按该计分定义计算平均分。切换后请核对页面给出的预计分数范围。'],
      ['主要计分项', '勾选后作为主要指标，并参与结果有效性判断；未勾选仍会计分，作为辅助指标。至少保留一个主要计分项。'],
      ['分数方向会改变得分吗', '不会自动改变分值、反向计分或报告文案。它记录分数含义；反向题在“题目”中设置，具体反馈在“报告文案”中编写。'],
      ['方向选项怎么选', '“描述性”不预设高低好坏；“高分代表更多”表示程度更高；“高分代表更多困难”表示困难更多；“高分更有利／低分更有利”记录有利方向；“双向”表示两端含义不同。'],
      ['怎样核对结果', '保存后可使用上方“计分预览”。预览会为每题选择第一个选项，仅用于核对示例结果，不是真实作答。'],
    ],
  },
  report: {
    title: '报告文案怎么编写？',
    intro: '先在“计分”确定指标，再为对应总分或维度编写作答后可见的说明。',
    points: [
      ['内容声明', '说明题目来源及允许使用的范围。声明随量表定义保存，填写声明本身不产生新的内容授权。'],
      ['解释与区间反馈', '可编写通用解释，或按原始分区间设置具体反馈。区间应对应实际分数范围；先用模拟预览核对边界和文案。'],
      ['避免误解', '自定义量表提供描述性结果，不因填写文案而具备常模、百分位或诊断结论。报告呈现还受实际发布与披露设置控制。'],
      ['发布之前', '保存报告定义，运行发布检查，再发布自用。保存草稿不等于发布，发布自用也不等于进入共用库。'],
    ],
  },
}

type Variant = 'training' | 'survey' | 'education'
// The workflow and scoring capabilities differ by product; guidance must follow the adapter.
const surveyHelp: Record<Section, (typeof help)[Section]> = {
  basic: { title: '呈现方式怎么选择？', intro: '按“基本设置 → 题目 → 响应选项 → 计分 → 报告反馈”编制；切换分区保留本页编辑。', points: [
    ['逐题与整份', '逐题呈现可记录浏览器逐题时间；整份呈现一次展示全部题目，不推定逐题反应时间。'],
    ['保存与版本', '保存会一并保存各分区的修改。工具草稿不等于已投放；发布时采用的冻结版本和项目设置决定实际施测。'],
  ] },
  items: { ...help.items, points: [ ...help.items.points.slice(0, 3), ['录完之后做什么', '到“响应选项”核对文字与分值，再到“计分”核对归属。新增内容题默认归入第一个维度（如有）；后续新增题目不会自动加入已启用的独立总分。'] ] },
  responses: { ...help.responses, points: [ ...help.responses.points, ['数量与保存', 'Survey 支持 2–15 个选项。批量粘贴后先应用，再保存量表；切换分区会保留尚未应用的文字。'] ] },
  scores: { title: '维度分与总分怎么设置？', intro: '先为维度选择内容题；需要整份汇总时，再启用独立总分并核对纳入题目。', points: [
    ['维度分', '每个维度分别选择题目；上方的求和／平均方式供所有维度共同使用。修改后请核对预计分数范围。'],
    ['独立总分', '可选功能，拥有自己的求和／平均方式和题目范围。首次启用时纳入当前全部内容题；后续新增题目需要手动纳入。'],
    ['反向与分数方向', '反向计分在“题目”中设置，会影响得分。分数方向记录高低分含义，不自动反转分值或生成报告文案。'],
    ['报告反馈', '完成计分后，在“报告反馈”编写原始分区间说明，并使用模拟作答核对结果和边界。'],
  ] },
  report: { title: '报告反馈怎么设置？', intro: '为已设置的维度或独立总分编写解释，并用模拟作答检查反馈是否匹配。', points: [
    ['区间与文案', '区间使用实际原始分范围；核对上下界和重叠提示，避免同一得分匹配冲突规则。'],
    ['模拟与保存', '模拟只用于检查当前编辑，不产生真实被试作答。切换分区保留本页内容；保存会一并保存所有分区。'],
    ['实际披露', '自编量表反馈是描述性解释，不自动产生常模或诊断。实际报告开放范围仍由项目发布与披露设置控制。'],
  ] },
}
function guidance(section: Section, variant: Variant) {
  if (variant === 'survey') return surveyHelp[section]
  if (variant === 'education') {
    if (section === 'scores') return { ...help.scores, points: help.scores.points.slice(0, -1).concat([['怎样核对结果', '保存草稿后，使用“检查定义”和“试填预览”核对计分。确认后再固定私有版本；固定版本本身不启动作答。'] as [string, string]]) }
    if (section === 'report') return { ...help.report, points: help.report.points.slice(0, -1).concat([['固定版本之前', '保存草稿，检查定义并试填预览，再固定私有版本。用于活动时仍需明确引用该版本；草稿修改不改写已冻结版本。'] as [string, string]]) }
    if (section === 'items') return { ...help.items, points: help.items.points.slice(0, -1).concat([['下一步与保存', '先核对“响应选项”，再选择计分题目。新增题目不会自动加入已有计分项；“保存草稿”会保存当前工具的编辑。'] as [string, string]]) }
  }
  return help[section]
}

/** Presentation-only guidance, independent of product APIs, persistence and scoring. */
export function ScaleAuthoringHelp({ section, readOnly = false, variant = 'training' }: { section: Section; readOnly?: boolean; variant?: Variant }) {
  const current = guidance(section, variant)
  return <details className="scale-edit-help" key={section}>
    <summary><CircleHelp size={19} aria-hidden="true" /><span>{current.title}</span><span className="scale-edit-help-hint">点击展开</span></summary>
    <div className="scale-edit-help-content">
      <p className="scale-edit-help-intro">{current.intro}</p>
      {readOnly && <p className="scale-edit-help-intro">当前版本只读。需要修改时，请使用页面允许的另存或修订入口创建草稿；具体操作以现有授权为准。</p>}
      {current.points.map(([title, description]) => <article key={title}><h3>{title}</h3><p>{description}</p></article>)}
    </div>
  </details>
}
