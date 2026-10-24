import type { ComponentProps } from 'react'
import type AuthShell from '../components/auth/AuthShell'
import { ArrowLeft, ArrowRight, ShieldCheck } from 'lucide-react'
import TrainingBrand from './TrainingBrand'
import TrainingAppearanceControl from './TrainingAppearanceControl'
import { TrainingAppearanceProvider } from './TrainingAppearance'
import { useTrainingAppearance } from './appearanceContext'
import './training-admin-login.css'

type Props = ComponentProps<typeof AuthShell>

function TrainingAdminLoginContent({ title, description, children, backTo = '/' }: Props) {
  const { theme } = useTrainingAppearance()
  return <div className="training-admin-login" data-training-theme={theme}>
    <header className="training-login-header">
      <a href={backTo} className="training-login-brand" aria-label="Training 首页"><TrainingBrand /></a>
      <div className="training-login-header-actions"><a href={backTo}><ArrowLeft size={16} aria-hidden="true" /><span>返回首页</span></a><TrainingAppearanceControl /></div>
    </header>
    <div className="training-login-layout">
      <section className="training-login-panel" aria-labelledby="training-login-title">
        <header className="training-login-panel-heading"><span className="training-login-mark"><ShieldCheck size={22} aria-hidden="true" /></span><h1 id="training-login-title">{title}</h1><p>{description}</p></header>
        {children}
        <p className="training-login-scope"><ShieldCheck size={14} aria-hidden="true" />仅限已获 Training 管理授权的账号</p>
      </section>
    </div>
    <footer className="training-login-footer"><span>© {new Date().getFullYear()} Training @EduK12.top</span><a href={backTo}>回到培训首页<ArrowRight size={14} aria-hidden="true" /></a></footer>
  </div>
}

/** Training presentation only; the existing form owns authentication and return routing. */
export default function TrainingAdminLoginShell(props: Props) {
  return <TrainingAppearanceProvider management><TrainingAdminLoginContent {...props} /></TrainingAppearanceProvider>
}
