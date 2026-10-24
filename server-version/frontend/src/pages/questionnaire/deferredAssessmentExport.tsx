import { createElement, useEffect, useState, type ComponentProps, type ComponentType } from 'react'
import type AssessmentDataExport from './AssessmentDataExport'

type Props = ComponentProps<typeof AssessmentDataExport>

/** Share only presentation code, never export intents, authorization or data.
 * A failed download stays local and keeps the list available. A failed browser module URL needs a new document,
 * not another promise for the same cached failure. Reload is explicit and never exports. */
export function deferredAssessmentExport(load: () => Promise<ComponentType<Props>>, reloadPage: () => void = () => window.location.reload()) {
  let resolved: ComponentType<Props> | undefined
  let pending: Promise<ComponentType<Props>> | undefined
  const prepare = () => pending ??= load().then(value => (resolved = value)).catch(error => {
    pending = undefined
    throw error
  })
  return function DeferredExport(props: Props) {
    const [Component, setComponent] = useState(() => resolved)
    const [failed, setFailed] = useState(false)
    const [confirmReload, setConfirmReload] = useState(false)
    useEffect(() => {
      let current = true
      if (!Component) {
        setFailed(false)
        void prepare().then(value => { if (current) setComponent(() => value) })
          .catch(() => { if (current) setFailed(true) })
      }
      return () => { current = false }
    }, [Component])
    if (Component) return createElement(Component, props)
    return failed
      ? <div role="alert"><p>数据导出组件加载失败，尚未提交导出。</p><p>请重新加载页面，再手动打开数据导出；不会自动提交导出。</p>
        {confirmReload ? <><p>重新加载会丢失本页尚未保存的内容。请先保存需要的内容，再确认重新加载。</p><button type="button" className="tql-secondary" onClick={reloadPage}>确认重新加载</button><button type="button" className="tql-secondary" onClick={() => setConfirmReload(false)}>取消重新加载</button></>
          : <button type="button" className="tql-secondary" onClick={() => setConfirmReload(true)}>重新加载页面</button>}
        <button type="button" className="tql-secondary" onClick={props.onClose}>关闭数据导出</button></div>
      : <p role="status">正在读取数据导出…</p>
  }
}

