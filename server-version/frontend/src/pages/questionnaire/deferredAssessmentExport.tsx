import { createElement, useEffect, useState, type ComponentProps, type ComponentType } from 'react'
import type AssessmentDataExport from './AssessmentDataExport'

type Props = ComponentProps<typeof AssessmentDataExport>

/** Share only presentation code, never export intents, authorization or data.
 * A failed download stays local and can be retried without losing the list. */
export function deferredAssessmentExport(load: () => Promise<ComponentType<Props>>) {
  let resolved: ComponentType<Props> | undefined
  let pending: Promise<ComponentType<Props>> | undefined
  const prepare = () => pending ??= load().then(value => (resolved = value)).catch(error => {
    pending = undefined
    throw error
  })
  return function DeferredExport(props: Props) {
    const [Component, setComponent] = useState(() => resolved)
    const [failed, setFailed] = useState(false)
    const [revision, setRevision] = useState(0)
    useEffect(() => {
      let current = true
      if (!Component) {
        setFailed(false)
        void prepare().then(value => { if (current) setComponent(() => value) })
          .catch(() => { if (current) setFailed(true) })
      }
      return () => { current = false }
    }, [Component, revision])
    if (Component) return createElement(Component, props)
    return failed
      ? <div role="alert"><p>数据导出组件加载失败，尚未提交导出。</p><button type="button" className="tql-secondary" onClick={() => setRevision(value => value + 1)}>重试加载导出</button><button type="button" className="tql-secondary" onClick={props.onClose}>关闭数据导出</button></div>
      : <p role="status">正在读取数据导出…</p>
  }
}

