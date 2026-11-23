import {Link} from 'react-router-dom'
import {ArrowRight,BookOpen,GraduationCap,LifeBuoy,UserRound} from 'lucide-react'
import TrainingPublicHeader from './TrainingPublicHeader'
import './training-portal-refresh.css'
import './training-help.css'

export default function TrainingContactPage() {
  return <div className="training-portal training-contact-page">
    <TrainingPublicHeader />
    <section className="training-contact-content" aria-labelledby="training-contact-title">
      <header className="training-help-heading"><p>TRAINING · 使用指引</p><h1 id="training-contact-title">使用帮助</h1><span>从加入课程到管理账号，在这里找到下一步。</span></header>
      <div className="training-help-grid">
        <section className="training-help-topic"><BookOpen size={24} aria-hidden="true"/><h2>加入课程</h2><p>请向课程培训师获取课程码。已有账号可登录后加入课程；首次使用请先注册学员账号。</p><div className="training-help-links"><Link to="/login">登录 Training<ArrowRight size={15} aria-hidden="true"/></Link><Link to="/register">注册学员账号<ArrowRight size={15} aria-hidden="true"/></Link></div></section>
        <section className="training-help-topic"><LifeBuoy size={24} aria-hidden="true"/><h2>账号与课程问题</h2><p>忘记密码、课程码失效或无法加入课程时，请联系提供课程码的培训师核对账号和课程状态。培训师可在课程学员管理中协助处理密码重置。</p><small>请准备好登录账号和课程名称，方便培训师核对。</small></section>
        <section className="training-help-topic"><GraduationCap size={24} aria-hidden="true"/><h2>成为培训师</h2><p>请向所在项目的 Training 管理员申请培训师注册码。注册后需等待管理员审核，通过后即可管理课程。</p><div className="training-help-links"><Link to="/register">培训师注册<ArrowRight size={15} aria-hidden="true"/></Link></div></section>
        <section className="training-help-topic"><UserRound size={24} aria-hidden="true"/><h2>了解功能</h2><p>查看课程、工具、素材与学习反馈的使用方式，选择适合当前学习任务的入口。</p><div className="training-help-links"><Link to="/features/courses">课程功能介绍<ArrowRight size={15} aria-hidden="true"/></Link><Link to="/">返回 Training 首页<ArrowRight size={15} aria-hidden="true"/></Link></div></section>
      </div>
    </section>
  </div>
}
