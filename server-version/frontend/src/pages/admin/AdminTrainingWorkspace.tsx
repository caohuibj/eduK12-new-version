import { Link } from 'react-router-dom'
import { BookOpen, ClipboardCheck, KeyRound, ShieldCheck, Users } from 'lucide-react'
import { PageHeader, ProductPage } from '../../components/product-ui'

const work = [
  {
    title: '培训师与学员账户',
    description: '审核培训师、管理账号，以及签发培训师注册码。统一账号管理，不建立第二套用户库。',
    Icon: Users,
    links: [
      { to: '/users', label: '账户审核与管理' },
      { to: '/teacher-codes', label: '培训师注册码' },
    ],
  },
  {
    title: '测评资源授权',
    description: '查看培训师可使用的量表、认知配置、报告包与固定测评包的实际授权，保留平台资源准入规则。',
    Icon: KeyRound,
    links: [
      { to: '/admin/material-grants', label: '材料使用授权' },
      { to: '/admin/instrument-authorizations', label: '测评使用授权' },
    ],
  },
  {
    title: '培训课程监管',
    description: '按现有课程访问规则查阅课程和管理问题；普通培训师只管理自己的课程成员。',
    Icon: BookOpen,
    links: [{ to: '/courses', label: '课程管理与查询' }],
  },
  {
    title: '内容审核与报告配置',
    description: '测评包发布资格、报告方案和测评内容治理继续使用统一平台的审批与科学流程。',
    Icon: ClipboardCheck,
    links: [
      { to: '/admin/bundle-authoring', label: '固定测评包制作与审批' },
      { to: '/admin/reporting-content', label: '报告方案与内容审核' },
    ],
  },
] as const

/** A navigation workspace, not another admin authority or copied grant state. */
export default function AdminTrainingWorkspace() {
  return <ProductPage width="management" className="training-admin-space">
    <PageHeader title="培训版管理" description="培训师审核、测评授权与课程治理统一办理。学员和培训师仍使用独立的培训前台。" />
    <p className="training-admin-scope" role="note">
      当前账号、课程和授权数据库由 Huisurvey 多个产品入口共享；这里展示的是统一管理能力，
      并未建立“只属于培训版”的数据筛选。正式多产品隔离需要服务端产品归属与权限规则。
    </p>
    <div className="training-admin-grid">
      {work.map(({ title, description, Icon, links }) => <section key={title} className="training-admin-card">
        <Icon size={23} aria-hidden="true" />
        <h2>{title}</h2>
        <p>{description}</p>
        <div className="training-admin-links">
          {links.map(({ to, label }) => <Link key={to} to={to}>{label} →</Link>)}
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
