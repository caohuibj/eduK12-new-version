import type {ComponentProps} from 'react'
import {Link} from 'react-router-dom'
import {ShieldCheck,Check} from 'lucide-react'
import type AuthShell from '../components/auth/AuthShell'
import './system-admin.css'
/** Product-neutral entry; authentication controls are supplied unchanged. */
export default function SystemAdminEntryShell({title,description,children}:ComponentProps<typeof AuthShell>){return <div className="system-admin-shell system-admin-auth">
 <aside className="system-login-intro" aria-label="系统管理介绍"><div className="system-entry-brand"><ShieldCheck size={29} aria-hidden="true"/><strong>系统管理</strong></div><div><p className="system-eyebrow">PLATFORM GOVERNANCE</p><h2>清晰的权限，<br/>有据的治理。</h2><p>管理员授权、共享工具与数据审计，在独立的系统工作台中处理。</p><ul>{['管理入口与平台内容权限','共享工具的全局治理','按范围查阅，重要操作留痕'].map(text=><li key={text}><Check size={16} aria-hidden="true"/>{text}</li>)}</ul></div><small>系统管理 · 独立身份验证</small></aside>
 <div className="system-login-main"><section aria-label={title}>{title.includes('绑定')&&<Link className="system-login-back" to="/admin/login?returnTo=%2Fadmin%2Fsystem">返回系统管理员登录</Link>}<h1>{title}</h1><p className="system-login-description">{description}</p>{children}</section></div>
 </div>}
