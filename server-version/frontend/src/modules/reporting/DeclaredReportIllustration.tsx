import type { ReactNode } from 'react'
import { CHEMISTRY_SELF_CONCEPT_ACTIONS, CHINESE_SELF_CONCEPT_ACTIONS, type SelfConceptAction } from './declaredReportActionBand'
import underline from '../../assets/chinese-self-concept-actions-v2/very_low.webp'
import bookmark from '../../assets/chinese-self-concept-actions-v2/low.webp'
import notes from '../../assets/chinese-self-concept-actions-v2/middle.webp'
import closeReading from '../../assets/chinese-self-concept-actions-v2/high.webp'
import retelling from '../../assets/chinese-self-concept-actions-v2/very_high.webp'
import doorComic from '../../assets/chinese-self-concept-door-v1.webp'

import chemistryStory from '../../assets/chemistry-self-concept-v1/story.webp'
import chemistrySketch from '../../assets/chemistry-self-concept-v1/very_low.webp'
import chemistryQuestion from '../../assets/chemistry-self-concept-v1/low.webp'
import chemistryCompare from '../../assets/chemistry-self-concept-v1/middle.webp'
import chemistryExplain from '../../assets/chemistry-self-concept-v1/high.webp'
import chemistryRetell from '../../assets/chemistry-self-concept-v1/very_high.webp'

export function DeclaredReportIllustration({ illustrationKey }: { illustrationKey?: string }) {
  if (illustrationKey === CHEMISTRY_SELF_CONCEPT_ACTIONS) return (
    <figure className="my-4 w-full max-w-sm">
      <img src={chemistryStory} width={512} height={512} loading="lazy" decoding="async" className="block h-auto w-full rounded-lg"
        alt="小岚和同桌端详盐水，试着用纸上的圆点画出看不见的变化。" />
    </figure>
  )
  if (illustrationKey !== 'chinese-self-concept-door-v1' && illustrationKey !== CHINESE_SELF_CONCEPT_ACTIONS) return null
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
  chemistry_very_low: { src: chemistrySketch, width: 512, alt: '小岚画下蓝色圆点，准备讲一讲自己的想法。' },
  chemistry_low: { src: chemistryQuestion, width: 512, alt: '小岚在书页上贴一张问号便签，和同桌讨论。' },
  chemistry_middle: { src: chemistryCompare, width: 512, alt: '小岚把表示观察和猜想的两张图卡并排摆好。' },
  chemistry_high: { src: chemistryExplain, width: 512, alt: '小岚指着自己画的示意图，向同桌解释关键线索。' },
  chemistry_very_high: { src: chemistryRetell, width: 512, alt: '小岚把自己的图交给同桌，拿着铅笔准备补充。' },
} satisfies Record<SelfConceptAction, { src: string; width: number; alt: string }>

export function DeclaredBandFeedback({ band, children }: { band?: SelfConceptAction; children: ReactNode }) {
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
