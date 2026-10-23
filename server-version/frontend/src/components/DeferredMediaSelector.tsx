import { lazy, Suspense, useEffect, useState, type ComponentProps } from 'react'

const MediaSelector = lazy(() => import('./MediaSelector'))

/** Load the picker at its first opening, then retain its existing dialog state. */
export default function DeferredMediaSelector(props: ComponentProps<typeof MediaSelector>) {
  const [opened, setOpened] = useState(props.isOpen)
  useEffect(() => { if (props.isOpen) setOpened(true) }, [props.isOpen])
  if (!props.isOpen && !opened) return null
  return <Suspense fallback={<p role="status">正在加载素材选择器…</p>}>
    <MediaSelector {...props} />
  </Suspense>
}
