import {
  PageHeader,
  ProductButton,
  ProductPage,
  ProductStatus,
} from '../../components/product-ui'
import {
  ReportCoreSummary,
  ReportDetails,
  ReportDisclaimer,
  ReportMetric,
  ReportMetricGrid,
  ReportRangeTrack,
  ReportSection,
} from '../../modules/reporting/ReportPrimitives'
import { ReportTrendChart } from '../../modules/reporting/ReportTrendChart'
import type { LongitudinalTrendModel } from '../../modules/reporting/longitudinalVisualization'
import {
  CognitivePracticeResult,
  CognitiveTaskCompletionNotice,
  CognitiveTaskIntro,
  CognitiveTaskTransition,
} from '../../modules/cognitive/tasks/shared/CognitiveTaskPresentation'
import './design-system-lab.css'

const colors = [
  ['Ink', '--hui-ds-color-ink', '#14304A'],
  ['Muted', '--hui-ds-color-muted', '#64748B'],
  ['Surface', '--hui-ds-color-surface', '#FFFFFF'],
  ['Page', '--hui-ds-color-page', '#F8FBFF'],
  ['Soft', '--hui-ds-color-soft', '#EFF7FF'],
  ['Line', '--hui-ds-color-line', '#DDE7F0'],
  ['Action', '--hui-ds-color-action', '#2F6FED'],
  ['Sky', '--hui-ds-color-sky', '#38BDF8'],
  ['Success', '--hui-ds-color-success', '#22C55E'],
  ['Warning', '--hui-ds-color-warning', '#F59E0B'],
] as const

const spacing = [
  ['4', '--hui-ds-space-1'],
  ['8', '--hui-ds-space-2'],
  ['12', '--hui-ds-space-3'],
  ['16', '--hui-ds-space-4'],
  ['20', '--hui-ds-space-5'],
  ['24', '--hui-ds-space-6'],
  ['32', '--hui-ds-space-8'],
  ['40', '--hui-ds-space-10'],
  ['48', '--hui-ds-space-12'],
  ['64', '--hui-ds-space-16'],
] as const

const radii = [
  ['8', '--hui-ds-radius-sm'],
  ['12', '--hui-ds-radius-md'],
  ['16', '--hui-ds-radius-lg'],
  ['20', '--hui-ds-radius-xl'],
  ['24', '--hui-ds-radius-2xl'],
  ['Pill', '--hui-ds-radius-pill'],
] as const

const comparableTrend: LongitudinalTrendModel = {
  metricId: 'engagement',
  state: 'comparable',
  hasSuppressedValues: false,
  points: [
    { label: '第 1 次测量', value: 62.4 },
    { label: '第 2 次测量', value: 66.8 },
    { label: '第 3 次测量', value: 68.1 },
  ],
  segments: [
    { fromIndex: 0, toIndex: 1, connect: true, comparabilityLevel: 'EXACT', delta: 4.4 },
    { fromIndex: 1, toIndex: 2, connect: true, comparabilityLevel: 'COMPATIBLE', delta: 1.3 },
  ],
}

const notComparableTrend: LongitudinalTrendModel = {
  metricId: 'stress',
  state: 'not_comparable',
  hasSuppressedValues: false,
  points: [
    { label: '第 1 次测量', value: 41.2 },
    { label: '第 2 次测量', value: 39.6 },
    { label: '第 3 次测量', value: 38.9 },
  ],
  segments: [
    { fromIndex: 0, toIndex: 1, connect: false, comparabilityLevel: 'NOT_COMPARABLE' },
    { fromIndex: 1, toIndex: 2, connect: true, comparabilityLevel: 'LIMITED' },
  ],
}

const suppressedTrend: LongitudinalTrendModel = {
  metricId: 'support',
  state: 'suppressed',
  hasSuppressedValues: true,
  points: [],
  segments: [],
}

function TokenFoundations() {
  return (
    <section id="foundations" className="ui-lab-panel" aria-labelledby="ui-lab-foundations">
      <header className="ui-lab-panel__header">
        <p className="ui-lab-kicker">Foundations</p>
        <h2 id="ui-lab-foundations">设计基础</h2>
        <p>直接读取生产代码中的 <code>--hui-ds-*</code> tokens；这里不维护第二份颜色、间距或圆角真相。</p>
      </header>

      <div className="ui-lab-subsection">
        <h3>Color tokens</h3>
        <div className="ui-lab-color-grid">
          {colors.map(([label, token, fallback]) => (
            <article className="ui-lab-color" key={token}>
              <div className="ui-lab-color__swatch" style={{ background: `var(${token}, ${fallback})` }} />
              <strong>{label}</strong>
              <code>{token}</code>
              <span>{fallback}</span>
            </article>
          ))}
        </div>
      </div>

      <div className="ui-lab-foundation-grid">
        <div className="ui-lab-subsection">
          <h3>Spacing scale</h3>
          <div className="ui-lab-spacing-list">
            {spacing.map(([label, token]) => (
              <div key={token} className="ui-lab-spacing">
                <code>{label}px</code>
                <span style={{ width: `var(${token})` }} />
                <small>{token}</small>
              </div>
            ))}
          </div>
        </div>
        <div className="ui-lab-subsection">
          <h3>Radius scale</h3>
          <div className="ui-lab-radius-grid">
            {radii.map(([label, token]) => (
              <div key={token} className="ui-lab-radius" style={{ borderRadius: `var(${token})` }}>
                <strong>{label}</strong>
                <code>{token}</code>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="ui-lab-subsection">
        <h3>Typography hierarchy</h3>
        <div className="ui-lab-type">
          <div><span>Page title</span><strong className="ui-lab-type__page">学习与成长报告</strong></div>
          <div><span>Section title</span><strong className="ui-lab-type__section">核心反馈</strong></div>
          <div><span>Body</span><p>优先说明这组结果意味着什么，再展示数字、图表、证据与限制。</p></div>
          <div><span>Caption</span><small>用于方法、来源、状态与辅助说明。</small></div>
        </div>
      </div>
    </section>
  )
}

function ProductUISpecimens() {
  return (
    <section id="product-ui" className="ui-lab-panel" aria-labelledby="ui-lab-product">
      <header className="ui-lab-panel__header">
        <p className="ui-lab-kicker">Product UI</p>
        <h2 id="ui-lab-product">共享交互组件</h2>
        <p>组件几何与状态直接来自正式 Product UI。Lab 只展示，不实现业务事件。</p>
      </header>

      <div className="ui-lab-subsection">
        <h3>Buttons</h3>
        <div className="ui-lab-actions">
          <ProductButton variant="primary">主要操作</ProductButton>
          <ProductButton variant="secondary">次要操作</ProductButton>
          <ProductButton variant="danger">危险操作</ProductButton>
          <ProductButton disabled>不可用状态</ProductButton>
        </div>
      </div>

      <div className="ui-lab-status-grid">
        <ProductStatus kind="info" title="信息状态">适合说明范围、来源或阅读方式。</ProductStatus>
        <ProductStatus kind="success" title="成功状态">表示操作或流程已经完成。</ProductStatus>
        <ProductStatus kind="warning" title="谨慎状态">表示需要注意限制，不自动表示结果异常。</ProductStatus>
        <ProductStatus kind="error" title="错误状态">用于实际错误或无法继续的状态。</ProductStatus>
        <ProductStatus kind="pending" title="等待状态">用于正在执行或等待外部条件。</ProductStatus>
      </div>
    </section>
  )
}

function ReportPrimitiveSpecimens() {
  return (
    <section id="reports" className="ui-lab-panel" aria-labelledby="ui-lab-reports">
      <header className="ui-lab-panel__header">
        <p className="ui-lab-kicker">Report system</p>
        <h2 id="ui-lab-reports">报告阅读组件</h2>
        <p>同一组 primitives 同时支撑 Scale、Cognitive、SJT、Composite 与 Organization 报告。</p>
      </header>

      <div className="ui-lab-report-stack">
        <ReportCoreSummary label="核心反馈">
          <p className="text-sm font-normal">先给出最需要理解的结论，再进入指标、维度、证据与限制。</p>
        </ReportCoreSummary>

        <ReportSection title="核心指标" eyebrow="Headline metrics">
          <ReportMetricGrid>
            <ReportMetric emphasis label="总体自我调节" value="72 / 100" description="服务端明确提供的 total score。" />
            <ReportMetric label="准确率" value="94%" description="保留原始百分比单位。" />
            <ReportMetric label="反应时中位数" value="412 ms" description="异质单位不归一化为雷达图。" />
          </ReportMetricGrid>
        </ReportSection>

        <ReportSection title="维度画像" eyebrow="Dimensions" description="不同维度保留各自原始范围，不按条形长度横向比较。">
          <div className="report-range-grid">
            <ReportRangeTrack label="学习计划" value={18} formattedValue="18 / 25" range={{ min: 0, max: 25 }} reference={{ label: '参考均值 16.4', mean: 16.4 }} />
            <ReportRangeTrack label="自我监控" value={21} formattedValue="21 / 30" range={{ min: 0, max: 30 }} reference={{ band: { label: '来源定义区间', min: 15, max: 22.5 } }} />
          </div>
        </ReportSection>

        <ReportDetails title="证据、方法与详细说明">
          详细科学信息在视觉层级中后移，但不会从报告中删除。
        </ReportDetails>
        <ReportDisclaimer>结果仅反映当前投影与作答记录；前端不生成常模、百分位、cutoff 或诊断结论。</ReportDisclaimer>
      </div>
    </section>
  )
}

function CanonicalScenarios() {
  return (
    <section id="scenarios" className="ui-lab-panel" aria-labelledby="ui-lab-scenarios">
      <header className="ui-lab-panel__header">
        <p className="ui-lab-kicker">Canonical scenarios</p>
        <h2 id="ui-lab-scenarios">典型报告场景</h2>
        <p>用于设计评审的确定性 specimen，不连接真实用户或研究数据。</p>
      </header>

      <div className="ui-lab-scenario-grid">
        <article className="ui-lab-scenario">
          <p className="ui-lab-kicker">Scale</p>
          <h3>Total + dimensions</h3>
          <div className="ui-lab-scenario__metric"><strong>72</strong><span>总体自我调节 / 100</span></div>
          <div className="ui-lab-dimension-list" aria-label="量表维度示意">
            <div><span><strong>学习计划</strong><small>原始范围 0–25</small></span><b>18 / 25</b></div>
            <div><span><strong>坚持性</strong><small>原始范围 0–20</small></span><b>14 / 20</b></div>
          </div>
          <p className="ui-lab-note">不同维度保留各自 raw range；不使用填充长度暗示跨维度高低。</p>
        </article>

        <article className="ui-lab-scenario">
          <p className="ui-lab-kicker">Cognitive</p>
          <h3>Small multiples</h3>
          <div className="ui-lab-kpi-grid">
            <div><strong>94%</strong><span>准确率</span></div>
            <div><strong>412 ms</strong><span>反应时中位数</span></div>
            <div><strong>78 ms</strong><span>变异性</span></div>
            <div><strong>2</strong><span>遗漏</span></div>
          </div>
        </article>

        <article className="ui-lab-scenario ui-lab-scenario--wide">
          <p className="ui-lab-kicker">Situational</p>
          <h3>Construct × Channel</h3>
          <div className="ui-lab-matrix" role="table" aria-label="SJT construct channel matrix specimen">
            <div role="row" className="ui-lab-matrix__header"><span role="columnheader">Construct</span><span role="columnheader">Self</span><span role="columnheader">Peer</span><span role="columnheader">Teacher</span></div>
            <div role="row"><strong role="rowheader">Collaboration</strong><span role="cell">3.8</span><span role="cell">3.4</span><span role="cell">3.6</span></div>
            <div role="row"><strong role="rowheader">Responsibility</strong><span role="cell">4.1</span><span role="cell">3.7</span><span role="cell">3.9</span></div>
          </div>
          <p className="ui-lab-note">颜色只区分类别；不使用红绿表达“好/坏”。</p>
        </article>
      </div>
    </section>
  )
}

function CognitiveRunnerSpecimens() {
  const noop = () => undefined
  return (
    <section id="cognitive-runner" className="ui-lab-panel" aria-labelledby="ui-lab-cognitive-runner">
      <header className="ui-lab-panel__header">
        <p className="ui-lab-kicker">Cognitive runner</p>
        <h2 id="ui-lab-cognitive-runner">认知任务展示状态</h2>
        <p>只展示非计时 presentation states。正式 stimulus geometry、计时和输入事件继续由 task-owned runtime 与 timing tests 验证。</p>
      </header>

      <div className="ui-lab-cognitive-grid">
        <CognitiveTaskIntro
          title="连续执行任务"
          description="只在出现字母 X 时按下，其他字母不要按。"
          hint="电脑可按空格或 Enter；触屏可点击中央作答区。练习不计入正式成绩。"
          onAction={noop}
        />
        <CognitivePracticeResult
          correct={4}
          total={4}
          passed
          onContinue={noop}
          onRetry={noop}
        />
        <CognitiveTaskTransition
          title="区块完成，可以短暂休息"
          meta="即将开始区块 2 / 3"
          description="准备好后继续。休息时请不要离开测评页面太久。"
          actionLabel="继续下一组"
          onAction={noop}
        />
        <CognitiveTaskCompletionNotice />
      </div>
    </section>
  )
}

function LongitudinalSpecimens() {
  return (
    <section id="longitudinal" className="ui-lab-panel" aria-labelledby="ui-lab-longitudinal">
      <header className="ui-lab-panel__header">
        <p className="ui-lab-kicker">Visualization states</p>
        <h2 id="ui-lab-longitudinal">纵向可视化状态</h2>
        <p>同一个组件同时展示可连线、不可直接比较与隐私抑制三种正式状态。</p>
      </header>

      <div className="ui-lab-chart-grid">
        <ReportTrendChart model={comparableTrend} title="Engagement" description="服务端允许 DESCRIPTIVE_TREND，并明确返回 delta。" valueLabel="示意均值" />
        <ReportTrendChart model={notComparableTrend} title="Stress" description="第一段不可直接比较，因此保持断线；第二段允许描述趋势。" valueLabel="示意均值" />
        <ReportTrendChart model={suppressedTrend} title="Support" description="隐私保护状态不进入图表 series 或辅助文本数值。" valueLabel="示意均值" />
      </div>
    </section>
  )
}

export default function DesignSystemLab() {
  return (
    <ProductPage width="management" className="hui-ui-lab">
      <PageHeader
        title="Huisurvey UI Lab"
        description="Code-native Design System Workspace · 真实组件、确定性数据、响应式截图与 GPT 视觉评审的共同工作区。"
      />

      <ProductStatus kind="info" title="开发 / Visual QA 专用">
        此页面不属于正式用户导航，不读取或写入业务数据。生产构建默认不注册该路由。
      </ProductStatus>

      <nav className="ui-lab-nav" aria-label="UI Lab sections">
        <a href="#foundations">Foundations</a>
        <a href="#product-ui">Product UI</a>
        <a href="#reports">Reports</a>
        <a href="#scenarios">Scenarios</a>
        <a href="#cognitive-runner">Cognitive Runner</a>
        <a href="#longitudinal">Visualization</a>
      </nav>

      <TokenFoundations />
      <ProductUISpecimens />
      <ReportPrimitiveSpecimens />
      <CanonicalScenarios />
      <CognitiveRunnerSpecimens />
      <LongitudinalSpecimens />
    </ProductPage>
  )
}
