import {useEffect,useRef,type ReactNode} from 'react'
import {Link,useLocation} from 'react-router-dom'
import {LogOut,UserRound} from 'lucide-react'
import type {User} from '../types'
import {productOrigins} from '../products/origins'
import {trainingAdminPage,trainingAdminPages,trainingAdminProfilePath} from '../admin/trainingPages'
import TrainingBrand from './TrainingBrand'
import TrainingAppearanceControl from './TrainingAppearanceControl'
import {useTrainingAppearance} from './appearanceContext'
import './training-admin-workspace.css'

/** Product navigation only; route and API guards retain authority. */
export default function TrainingAdminShell({children,user,loggingOut,onLogout}:{children:ReactNode;user:User;loggingOut:boolean;onLogout:()=>Promise<void>}){
  const {theme}=useTrainingAppearance(),{pathname}=useLocation()
  const page=trainingAdminPage(pathname),main=useRef<HTMLElement>(null),previous=useRef(pathname)
  useEffect(()=>{if(previous.current!==pathname){main.current?.focus();window.scrollTo({top:0})}previous.current=pathname},[pathname])
  const home=new URL(productOrigins()?.admin??window.location.origin)
  if(import.meta.env.DEV&&['localhost','127.0.0.1'].includes(home.hostname))home.hostname='training.localhost'
  const profile=trainingAdminProfilePath
  return <div className="hui-app hui-training training-management-frame" data-training-theme={theme}>
    <a className="training-management-skip" href="#hui-main">跳到主要内容</a>
    <header className="training-management-topbar">
      <div className="training-management-brand-group"><a className="training-management-brand" href={home.origin+'/'} aria-label="Training 首页"><TrainingBrand/></a><span>培训管理</span></div>
      <nav className="training-management-tabs" aria-label="主要导航">
        {trainingAdminPages.map(item=><Link key={item.key} to={item.path} aria-current={item.key===page?.key?'page':undefined}>{item.label}</Link>)}
      </nav>
      <div className="training-management-account">
        <TrainingAppearanceControl/>
        <Link to={profile} aria-label="账户设置" aria-current={pathname===profile?'page':undefined}><UserRound size={17} aria-hidden="true"/><span><strong>{user.nickname||user.username}</strong><small>Training 管理员</small></span></Link>
        <button type="button" disabled={loggingOut} onClick={()=>void onLogout()} aria-label={loggingOut?'正在退出…':'退出登录'}><LogOut size={18} aria-hidden="true"/><span>{loggingOut?'正在退出…':'退出登录'}</span></button>
      </div>
    </header>
    <main id="hui-main" ref={main} tabIndex={-1} className="training-management-main">{children}</main>
    <footer className="training-management-footer"><span>© {new Date().getFullYear()} Training @EduK12.top</span><Link to="/admin/entrances">切换管理入口</Link><a href="https://beian.miit.gov.cn/" target="_blank" rel="noopener noreferrer">京ICP备2026001512号-2</a></footer>
  </div>
}
