import {useEffect,useRef,type ReactNode} from 'react'
import {Link,useLocation} from 'react-router-dom'
import {SchoolMark} from '../../school/SchoolMark'
import TeacherBrand from '../../huiteacher/TeacherBrand'
import {ProductThemeControl} from '../../components/product-theme/ProductThemeControl'
import {useProductTheme} from '../../components/product-theme/useProductTheme'
import './education-admin-shell.css'

/** Presentation only: AppShell selects this frame after the existing entry grant check. */
export default function EducationAdminShell({product,userId,username,loggingOut,onLogout,children}:{
 product:'School'|'Teacher';userId:string;username:string;loggingOut:boolean;onLogout:()=>Promise<void>;children:ReactNode
}){
 const appearance=useProductTheme(product==='School'?'school':'teacher',`admin:${userId}`)
 const main=useRef<HTMLElement>(null),location=useLocation(),previous=useRef(location.pathname)
 useEffect(()=>{if(previous.current!==location.pathname)main.current?.focus();previous.current=location.pathname},[location.pathname])
 return <div className="education-admin-shell" data-product={product} data-theme={appearance.theme}>
  <a className="education-admin-skip" href="#hui-main">跳至主要内容</a>
  <header className="education-admin-topbar">
   <Link to={product==='School'?'/admin/huischool':'/admin/huiteacher'} className="education-admin-brand" aria-label={`${product} 管理员首页`}>
    {product==='School'?<SchoolMark/>:<TeacherBrand/>}
   </Link>
   <span className="education-admin-caption">管理员工作台</span>
   <div className="education-admin-account"><ProductThemeControl appearance={appearance} product={product}/>
    <span className="education-admin-identity"><strong>{username}</strong><span>{product} 管理员</span></span>
    <button type="button" disabled={loggingOut} onClick={()=>void onLogout()}>{loggingOut?'正在退出…':'退出登录'}</button>
   </div>
  </header>
  <main id="hui-main" ref={main} tabIndex={-1}>{children}</main>
  <footer>{product} · @eduk12.top</footer>
 </div>
}
