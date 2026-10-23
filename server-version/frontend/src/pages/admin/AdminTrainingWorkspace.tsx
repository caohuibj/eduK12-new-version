import { Link } from 'react-router-dom'
import { ArrowRight, BookOpen, KeyRound, ShieldCheck, Users } from 'lucide-react'
import { ProductPage } from '../../components/product-ui'
import './admin-training.css'

const work = [
  {
    title: '培训师与学员账户',
    description: '审核培训师资格、管理培训账号与注册码，让每位参与者从清晰的身份开始。',
    Icon: Users,
    links: [
      { to: '/users', label: '账户审核与管理' },
      { to: '/teacher-codes', label: '培训师注册码' },
    ],
  },
  {
    title: '测评资源授权',
    description: '先在已发布资源页面发放使用授权，再到授权记录页核对或撤销。科学发布资格与培训师使用权限分别管理。',
    Icon: KeyRound,
    links: [
      { to: '/scales', label: '量表资源与授权' },
      { to: '/cognitive-assignments', label: '认知配置与授权' },
      { to: '/bundle-products', label: '固定测评包' },
      { to: '/admin/material-grants', label: '查看和撤销授权' },
      { to: '/admin/instrument-authorizations', label: '测评使用授权' },
    ],
  },
  {
    title: '培训课程监管',
    description: '按现有课程访问规则查阅课程和管理问题；普通培训师只管理自己的课程成员。',
    Icon: BookOpen,
    links: [{ to: '/courses', label: '课程管理与查询' }],
  },
] as const

/** A navigation workspace, not another admin authority or copied grant state. */
export default function AdminTrainingWorkspace() {
  return <ProductPage width="management" className="training-admin-space">
    <header className="training-admin-welcome">
      <div><p className="training-admin-eyebrow">TRAINING / 培训管理空间</p><h1>培训有序，管理有据。</h1><p>从账号审核到课程监管，让教学资源得到有序使用。</p></div>
      <span className="training-admin-identity"><ShieldCheck size={18} aria-hidden="true" />Training 独立管理资格</span>
    </header>
    <h2 className="training-admin-section-title">开始今天的管理工作</h2>
    <p className="training-admin-scope" role="note">
      本窗口使用显式 Training 管理授权，管理培训账号、培训课程及适用资源。
      系统治理、Survey 研究和学校产品需要各自授权；学校活动、研究项目与个人答卷仍按所属范围检查。
    </p>
    <div className="training-admin-grid">
      {work.map(({ title, description, Icon, links },index) => <section key={title} className="training-admin-card">
        <div className="training-admin-card-top"><Icon size={26} strokeWidth={1.5} aria-hidden="true" /><span>0{index+1}</span></div>
        <h2>{title}</h2>
        <p>{description}</p>
        <div className="training-admin-links">
          {links.map(({ to, label }) => <Link key={to} to={to + '?workspace=training'}>{label}<ArrowRight size={14} aria-hidden="true" /></Link>)}
        </div>
      </section>)}
    </div>
    <section className="training-admin-policy" aria-labelledby="training-admin-policy-heading">
      <ShieldCheck size={20} aria-hidden="true" />
      <div>
        <h2 id="training-admin-policy-heading">管理规则</h2>
        <p>课程成员管理与全局账号操作分开。测评资源使用授权、发布资格和报告查看权限分别核验；
          教师拥有材料使用权不代表可以读取全部学员的个体心理报告。</p>
        <p>现有自建量表与开放认知配置可能适用不同授权政策；本页不会绕过科学发布和资源准入。</p>
      </div>
    </section>
  </ProductPage>
}
