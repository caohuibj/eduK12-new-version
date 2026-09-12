import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { ActionBar, PageHeader, ProductButton, ProductPage, ProductStatus } from '../src/components/product-ui'
import './product-ui.css'

// Isolated, local-only presentation fixture. No runtime, session or network client.
export default function FoundationExample() {
  const [saved, setSaved] = useState(false)
  return (
    <main>
      <ProductPage width="assessment">
        <PageHeader title="了解自己的学习方式" description="按自己的情况选择。这个页面只演示布局与操作，不会创建或提交测评。" />
        <section aria-labelledby="question-heading" className="example-section">
          <p className="example-muted">第 1 / 3 题 · 布局示例</p>
          <h2 id="question-heading">开始一项新任务时，你通常会怎么做？</h2>
          <fieldset>
            <legend>选择最符合你的情况的一项</legend>
            {['先看一遍说明，再开始', '先试一试，遇到问题再看说明', '请老师或同学帮我理解要求'].map((label) => (
              <label className="example-answer" key={label}><input type="radio" name="answer" value={label} /><span>{label}</span></label>
            ))}
          </fieldset>
          <label className="example-field">还有什么想补充的？<textarea rows={3} placeholder="可以不填" /></label>
        </section>
        <div className="example-stack">
          <ProductStatus kind={saved ? 'success' : 'info'} title={saved ? '示例操作已确认' : '这是操作示例'} announce="polite">这里不会保存真实答案。</ProductStatus>
          <ActionBar label="示例操作"><ProductButton disabled>上一题</ProductButton><ProductButton variant="primary" onClick={() => setSaved(true)}>确认示例操作</ProductButton></ActionBar>
        </div>
        <section aria-labelledby="states-heading" className="example-stack example-section">
          <h2 id="states-heading">清楚的状态反馈</h2>
          <ProductStatus kind="pending" title="正在确认是否提交成功">请稍候，暂时不用重新作答。</ProductStatus>
          <ProductStatus kind="warning" title="当前设备需要调整">这项任务需要实体键盘，请使用支持的设备。</ProductStatus>
          <ProductStatus kind="error" title="回答尚未保存" actions={<ProductButton onClick={() => setSaved(true)}>重试示例操作</ProductButton>}>请重试后继续，避免丢失刚才的回答。</ProductStatus>
        </section>
      </ProductPage>
      <div id="legacy-sentinel"><button type="button">未迁移页面样式检查</button></div>
    </main>
  )
}

createRoot(document.getElementById('root')!).render(<FoundationExample />)
