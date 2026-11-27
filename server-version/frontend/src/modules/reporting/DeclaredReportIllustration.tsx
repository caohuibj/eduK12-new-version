import type { ReactNode } from 'react'
import { CHINESE_SELF_CONCEPT_ACTIONS, CHINESE_SELF_CONCEPT_SCORE_ACTIONS, type ChineseSelfConceptBand } from './declaredReportActionBand'
import underline from '../../assets/chinese-self-concept-actions-v2/very_low.webp'
import bookmark from '../../assets/chinese-self-concept-actions-v2/low.webp'
import notes from '../../assets/chinese-self-concept-actions-v2/middle.webp'
import closeReading from '../../assets/chinese-self-concept-actions-v2/high.webp'
import retelling from '../../assets/chinese-self-concept-actions-v2/very_high.webp'
import doorComic from '../../assets/chinese-self-concept-door-v1.webp'

export function DeclaredReportIllustration({ illustrationKey }: { illustrationKey?: string }) {
  const editions = ['chinese-self-concept-door-v1', CHINESE_SELF_CONCEPT_ACTIONS, CHINESE_SELF_CONCEPT_SCORE_ACTIONS]
  if (!illustrationKey || !editions.includes(illustrationKey)) return null
  return (
    <figure className="my-4 w-full max-w-3xl">
      <a href={doorComic} target="_blank" rel="noreferrer" className="block">
        <img src={doorComic} width={1635} height={962} loading="lazy" decoding="async"
          className="block h-auto w-full rounded-lg"
          alt="三格漫画。小禾读到门前的女孩，先想“我语文不行？”，接着认出“她在犹豫”，最后举手问“她在怕什么？”" />
        <span className="mt-1 inline-block text-sm underline">查看漫画大图</span>
      </a>
    </figure>
  )
}

const actions = {
  very_low: { src: underline, width: 512, alt: '小禾在读懂的一句课文下面画线。' },
  low: { src: bookmark, width: 512, alt: '小禾把橙色书签夹进课本，记下想聊的一页。' },
  middle: { src: notes, width: 512, alt: '摊开的笔记本上，一张便笺画着灯泡，另一张画着问号。' },
  high: { src: closeReading, width: 480, alt: '小禾拿着放大镜看课文，手指向原文中圈出的一处。' },
  very_high: { src: retelling, width: 572, alt: '小禾合上课本，给同桌讲刚读到的内容。' },
} satisfies Record<ChineseSelfConceptBand, { src: string; width: number; alt: string }>

export function DeclaredBandFeedback({ band, children }: { band?: ChineseSelfConceptBand; children: ReactNode }) {
  if (!band) return <>{children}</>
  const action = actions[band]
  return (
    <div className="grid items-center gap-3 sm:grid-cols-[minmax(0,1fr)_10rem]">
      {children}
      <img src={action.src} alt={action.alt} width={action.width} height={512}
        loading="lazy" decoding="async" className="h-auto w-40 max-w-full justify-self-center rounded-lg" />
    </div>
  )
}
