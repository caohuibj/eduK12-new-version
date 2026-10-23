import type {ComponentProps} from 'react'
import {Link,useLocation} from 'react-router-dom'
import type AuthShell from '../../components/auth/AuthShell'
import {SchoolMark} from '../../school/SchoolMark'
import TeacherBrand from '../../huiteacher/TeacherBrand'
import {ProductThemeControl} from '../../components/product-theme/ProductThemeControl'
import {useProductTheme} from '../../components/product-theme/useProductTheme'
import './education-admin-shell.css'
import {educationEntry} from './education-entry'

export default function EducationAdminEntryShell({title,description,children,backTo,backLabel}:ComponentProps<typeof AuthShell>){
 const {search}=useLocation(),product=educationEntry(search)??'School'
 const appearance=useProductTheme(product==='School'?'school':'teacher','admin-entry')
 return <div className="education-admin-shell education-admin-entry" data-product={product} data-theme={appearance.theme}>
  <a className="education-admin-skip" href="#education-admin-login">跳至主要内容</a>
  <header className="education-admin-topbar"><div className="education-admin-brand">{product==='School'?<SchoolMark/>:<TeacherBrand/>}</div>
   <span className="education-admin-caption">独立管理入口</span><div className="education-admin-account"><ProductThemeControl appearance={appearance} product={product}/></div>
  </header>
  <main id="education-admin-login" tabIndex={-1}><section className="education-admin-entry-card">
   <p className="education-admin-entry-kicker">{product} · 管理员</p><h1>{title}</h1><p>{description}</p>
   {children}
   <Link className="education-admin-entry-back" to={backTo??'/admin/entrances'}>{backLabel??'返回管理入口'}</Link>
  </section></main>
 </div>
}
