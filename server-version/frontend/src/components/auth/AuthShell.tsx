import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, BookOpenCheck, GraduationCap, HeartHandshake, ShieldCheck } from 'lucide-react'
import './auth-shell.css'
import { isTrainingHost } from '../../training/context'

export type AuthTone = 'student' | 'teacher' | 'parent' | 'admin'

const toneContent = {
  student: {
    label: '学生入口',
    heroTitle: '欢迎回来，继续今天的学习旅程',
    heroDescription: '登录后可查看课程、待完成测评、课堂任务以及已经保存的进度。',
    bullets: ['支持电脑、平板和手机', '已保存的任务可继续完成', '测评作答保持专注模式'],
    Icon: GraduationCap,
  },
  teacher: {
    label: '教师入口',
    heroTitle: '把教学、测评与成长反馈放在一个清晰的工作空间',
    heroDescription: '集中管理课程与测评任务，在需要时快速回到学生、课堂和报告。',
    bullets: ['面向日常教学的清晰工作区', '电脑端高效管理，移动端保持可用', '关键状态与操作保持一致'],
    Icon: BookOpenCheck,
  },
  parent: {
    label: '家长入口',
    heroTitle: '用更清晰的观察，理解孩子的成长变化',
    heroDescription: '安全完成学校邀请的观察测评，并查看属于自己的反馈结果。',
    bullets: ['步骤清晰，减少填写负担', '手机端优先保证单手操作', '个人结果与学校任务分开呈现'],
    Icon: HeartHandshake,
  },
  admin: {
    label: '管理员入口',
    heroTitle: '稳定地管理平台，让教学与测评顺畅运行',
    heroDescription: '管理账户、内容与授权，同时保留清晰的组织与数据访问边界。',
    bullets: ['平台配置集中管理', '重要状态优先呈现', '桌面效率与移动可用性兼顾'],
    Icon: ShieldCheck,
  },
} as const

type AuthShellProps = {
  tone: AuthTone
  title: string
  description: string
  children: ReactNode
  backTo?: string
  backLabel?: string
  onBack?: () => void
  heroTitle?: string
  heroDescription?: string
  heroBullets?: readonly string[]
}

export default function AuthShell({
  tone,
  title,
  description,
  children,
  backTo = '/',
  backLabel = '返回入口',
  onBack,
  heroTitle,
  heroDescription,
  heroBullets,
}: AuthShellProps) {
  const preset = toneContent[tone]
  const Icon = preset.Icon
  const training = isTrainingHost() && (tone === 'student' || tone === 'teacher')
  const trainingRole = tone === 'student' ? '学员' : '培训师'
  const copy = (value: string) => training ? value.replace(/学生/g, '学员').replace(/教师/g, '培训师').replace(/班级/g, '课程') : value
  const displayHeroTitle = training ? (tone === 'student' ? '循着课程，慢慢向前。' : '以所学，启发更多人。') : (heroTitle ?? preset.heroTitle)
  const displayHeroDescription = training
    ? (tone === 'student' ? '加入培训课程，完成作业、打卡与测评。' : '创建课程，组织培训，见证学习与成长。')
    : (heroDescription ?? preset.heroDescription)
  const bullets = training ? [] : (heroBullets ?? preset.bullets)

  return (
    <div className={`hui-auth-page hui-auth-page--${tone}${training ? ' hui-auth-page--training' : ''}`}>
      <aside className="hui-auth-hero" aria-label="Huisurvey 介绍">
        <div className="hui-auth-hero__inner">
          <Link to="/" className="hui-auth-brand" aria-label="返回 Huisurvey 入口">
            <span className="hui-auth-brand__mark" aria-hidden="true" />
            <strong>{training ? 'Huisurvey Training' : 'Huisurvey'}</strong>
          </Link>

          <div className="hui-auth-hero__copy">
            <span className="hui-auth-eyebrow"><Icon size={16} aria-hidden="true" />{training ? `${trainingRole}入口` : preset.label}</span>
            <p className="hui-auth-hero__title">{displayHeroTitle}</p>
            <p className="hui-auth-hero__description">{displayHeroDescription}</p>
          </div>

          {bullets.length > 0 && <ul className="hui-auth-benefits">
            {bullets.map((item) => <li key={item}><span aria-hidden="true" />{item}</li>)}
          </ul>}
        </div>
      </aside>

      <section className="hui-auth-stage">
        <div className="hui-auth-stage__inner">
          {onBack ? (
            <button type="button" className="hui-auth-back hui-auth-back--button" onClick={onBack}>
              <ArrowLeft size={18} aria-hidden="true" />{backLabel}
            </button>
          ) : (
            <Link to={backTo} className="hui-auth-back"><ArrowLeft size={18} aria-hidden="true" />{backLabel}</Link>
          )}

          <div className="hui-auth-card">
            <header className="hui-auth-card__header">
              <span className="hui-auth-card__icon" aria-hidden="true"><Icon size={23} /></span>
              <div>
                <h1>{copy(title)}</h1>
                <p>{copy(description)}</p>
              </div>
            </header>
            <div className="hui-auth-card__body">{children}</div>
          </div>

          <p className="hui-auth-stage__tagline">{training ? '学有所思，行有所获。' : 'Better Assessment. Healthier Students. Brighter Schools.'}</p>
        </div>
      </section>
    </div>
  )
}
