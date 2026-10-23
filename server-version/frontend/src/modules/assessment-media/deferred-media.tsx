import { createElement, useEffect, useState, type ComponentType } from 'react'

/** Presentation code contains no answers or capabilities. Share its download,
 * but keep errors and retry controls local. Never expose a stimulus while loading. */
export function deferredAssessmentMedia<P extends object>(load: () => Promise<ComponentType<P>>) {
  let resolved: ComponentType<P> | undefined
  let pending: Promise<ComponentType<P>> | undefined
  const prepare = () => pending ??= load().then(value => (resolved = value)).catch(error => {
    pending = undefined
    throw error
  })
  return function DeferredMedia(props: P) {
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
      ? <div role="alert"><p>测评媒体组件加载失败，作答尚未开放。</p><button type="button" className="btn-secondary" onClick={() => setRevision(value => value + 1)}>重试媒体组件</button></div>
      : <p role="status">正在准备测评媒体组件…</p>
  }
}
