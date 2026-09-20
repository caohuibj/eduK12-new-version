import React, { useState } from 'react'
import { CheckCircle2, Compass, HeartHandshake, Lightbulb, ShieldCheck, Sparkles } from 'lucide-react'

type FocusKey = 'body' | 'small_step' | 'space' | 'talk' | 'observe'

type FocusPlan = {
  title: string
  summary: string
  actions: string[]
}

const themes = [
  {
    title: '情绪与动力',
    text: '问卷关注了低落、难以感到愉快、兴趣减少，以及开始做事情时感觉费力等体验。',
  },
  {
    title: '担忧与身体反应',
    text: '问卷也涉及害怕、慌张、心跳或呼吸变化、发抖等在紧张时可能出现的情绪和身体体验。',
  },
  {
    title: '紧绷与烦躁',
    text: '另一部分关注难以放松、坐立不安、容易烦躁，以及被事情打断时很难缓下来的体验。',
  },
] as const

const focusPlans: Record<FocusKey, FocusPlan> = {
  body: {
    title: '让身体慢一点',
    summary: '先不急着解决所有问题，给身体一个从紧绷状态里退出来的机会。',
    actions: ['离开屏幕走动几分钟', '喝点水，活动肩颈和手臂', '找一个相对安静的地方坐一会儿'],
  },
  small_step: {
    title: '把事情拆小一点',
    summary: '当启动一件事很费劲时，只决定“下一步”往往比要求自己一次完成全部更容易。',
    actions: ['只写下接下来最小的一步', '先做 10 分钟，再决定是否继续', '完成一个小步骤后允许自己停一下'],
  },
  space: {
    title: '给大脑留一点空隙',
    summary: '减少一小段持续输入，有时能帮助注意力和情绪重新找到节奏。',
    actions: ['安排几分钟不看消息和短视频', '把反复出现的担心先写下来', '暂时不要求自己立刻想清所有问题'],
  },
  talk: {
    title: '找一个人说说',
    summary: '不一定要等到事情“很严重”才可以找人聊。把感受说出来本身就是一种整理。',
    actions: ['选一个你相对信任的人', '可以从“我最近有点累，想跟你聊一会儿”开始', '如果更愿意，也可以联系学校心理老师或专业人员'],
  },
  observe: {
    title: '先观察，不急着改变',
    summary: '如果现在还不确定要做什么，可以先看看哪些情境让自己更累，哪些时刻会稍微轻松一点。',
    actions: ['留意一天里情绪变化比较明显的时段', '记住一个让自己稍微舒服一点的情境', '一周后再回看是否出现了新的规律'],
  },
}

const focusOptions: Array<{ key: FocusKey; label: string }> = [
  { key: 'body', label: '让身体慢一点' },
  { key: 'small_step', label: '把事情拆小一点' },
  { key: 'space', label: '给大脑留一点空隙' },
  { key: 'talk', label: '找一个人说说' },
  { key: 'observe', label: '先观察一周' },
]

const reflectionPrompts = [
  '过去一周，什么事情最消耗我的精力？',
  '什么时刻，我会稍微轻松或自在一点？',
  '接下来一周，我愿意为自己做的一件小事是什么？',
] as const

const Dass21StudentReport: React.FC = () => {
  const [focus, setFocus] = useState<FocusKey>('observe')
  const plan = focusPlans[focus]

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="bg-gradient-to-br from-slate-50 via-white to-indigo-50 p-6 md:p-8">
          <div className="flex items-start gap-4">
            <div className="rounded-2xl bg-white p-3 shadow-sm ring-1 ring-slate-200">
              <Compass className="h-6 w-6 text-indigo-600" />
            </div>
            <div>
              <p className="text-sm font-medium text-indigo-700">DASS-21 · 完成反馈</p>
              <h2 className="mt-1 text-2xl font-semibold text-slate-900">这一周，给自己一点观察空间</h2>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600">
                这份反馈不会给你打分，也不会给你贴上任何心理健康标签。它更像一张观察地图：帮助你理解刚才问卷关注了哪些体验，并选择一个你愿意照顾的方向。
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-indigo-600" />
          <h3 className="text-lg font-semibold text-slate-900">这份问卷关注了什么</h3>
        </div>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          下面三类内容只是问卷涉及的主题，并不表示系统判断你一定存在这些情况。
        </p>
        <div className="mt-5 grid gap-4 md:grid-cols-3">
          {themes.map((theme) => (
            <article key={theme.title} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <h4 className="font-semibold text-slate-900">{theme.title}</h4>
              <p className="mt-2 text-sm leading-6 text-slate-600">{theme.text}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center gap-2">
          <Lightbulb className="h-5 w-5 text-indigo-600" />
          <h3 className="text-lg font-semibold text-slate-900">选一个你现在最想照顾的方向</h3>
        </div>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          这里的选择完全由你决定，不是系统根据隐藏分数推荐的。可以随时换一个方向看看。
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          {focusOptions.map((option) => (
            <button
              key={option.key}
              type="button"
              onClick={() => setFocus(option.key)}
              className={`rounded-full px-4 py-2 text-sm font-medium transition ${
                focus === option.key
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
              }`}
              aria-pressed={focus === option.key}
            >
              {option.label}
            </button>
          ))}
        </div>
        <div className="mt-5 rounded-xl border border-indigo-100 bg-indigo-50/60 p-5">
          <h4 className="font-semibold text-slate-900">{plan.title}</h4>
          <p className="mt-2 text-sm leading-6 text-slate-700">{plan.summary}</p>
          <ul className="mt-4 space-y-2">
            {plan.actions.map((action) => (
              <li key={action} className="flex gap-2 text-sm leading-6 text-slate-700">
                <CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-indigo-600" />
                <span>{action}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="text-lg font-semibold text-slate-900">给未来自己的三个问题</h3>
          <p className="mt-2 text-sm leading-6 text-slate-600">不需要现在就回答。可以把它们留到今天晚上或这一周里再想。</p>
          <ol className="mt-4 space-y-3">
            {reflectionPrompts.map((prompt, index) => (
              <li key={prompt} className="flex gap-3 rounded-xl bg-slate-50 p-3 text-sm leading-6 text-slate-700">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white text-xs font-semibold text-indigo-700 ring-1 ring-slate-200">{index + 1}</span>
                <span>{prompt}</span>
              </li>
            ))}
          </ol>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-2">
            <HeartHandshake className="h-5 w-5 text-indigo-600" />
            <h3 className="text-lg font-semibold text-slate-900">什么时候值得找人聊聊</h3>
          </div>
          <p className="mt-3 text-sm leading-6 text-slate-600">
            如果一些困难持续存在、越来越强，或者已经明显影响学习、睡眠、人际关系或日常生活，可以考虑和可信任的成年人、学校心理老师或合适的专业人员谈一谈。
          </p>
          <p className="mt-3 text-sm leading-6 text-slate-600">
            这条建议对所有完成问卷的人都一样，不是由你的隐藏分数触发的。
          </p>
        </div>
      </section>

      <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
        <div className="flex gap-3">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />
          <div>
            <h3 className="font-semibold text-amber-900">需要立即帮助时</h3>
            <p className="mt-1 text-sm leading-6 text-amber-900/80">
              如果你此刻担心自己可能伤害自己、无法保证自己的安全，或正处在明显危险中，请立即联系身边可信任的成年人、当地紧急服务或可用的危机支持渠道。
            </p>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-slate-50 p-5 text-sm leading-6 text-slate-600">
        <strong className="text-slate-800">关于这份反馈：</strong>
        DASS-21 是一份关于过去一周体验的自评问卷。本学生报告不显示数值分数、严重程度等级、百分位或诊断结论，也不根据隐藏分数生成个体化判断。
      </section>
    </div>
  )
}

export default Dass21StudentReport
