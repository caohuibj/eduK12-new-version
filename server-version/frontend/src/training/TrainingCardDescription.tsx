import { useEffect, useRef, useState } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'

export default function TrainingCardDescription({ description, id, course = false }: { description: string; id: string; course?: boolean }) {
  const textRef = useRef<HTMLParagraphElement>(null)
  const [expanded, setExpanded] = useState(false)
  const [overflows, setOverflows] = useState(false)

  useEffect(() => {
    const text = textRef.current
    if (!text || expanded) return
    const measure = () => setOverflows(text.scrollHeight > text.clientHeight + 1)
    measure()
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(measure) : undefined
    observer?.observe(text)
    window.addEventListener('resize', measure)
    return () => { observer?.disconnect(); window.removeEventListener('resize', measure) }
  }, [description, expanded])

  return <div className={`training-card-description ${course ? 'training-trainer-course-intro' : 'training-library-description-block'}`}>
    <p ref={textRef} id={id} title={expanded ? undefined : description} className={`training-card-description-text ${course ? 'training-trainer-course-description' : 'training-library-description'}${expanded ? ' is-expanded' : ''}`}>{description}</p>
    {(overflows || expanded) && <button type="button" className="training-card-description-toggle" aria-expanded={expanded} aria-controls={id} onClick={() => setExpanded(value => !value)}>
      {expanded ? '收起' : '显示更多'}{expanded ? <ChevronUp size={14} aria-hidden="true"/> : <ChevronDown size={14} aria-hidden="true"/>}
    </button>}
  </div>
}
