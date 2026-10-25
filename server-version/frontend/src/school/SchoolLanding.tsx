import { useEffect, useRef, useState } from 'react'
import { ArrowRight, Menu, X } from 'lucide-react'
import { SchoolMark } from './SchoolMark'
import { schoolFeatures } from './school-features'
import { ProductThemeControl } from '../components/product-theme/ProductThemeControl'
import type { ProductAppearanceState, ProductTheme } from '../components/product-theme/useProductTheme'
import campusMoonlight from './huischool-campus-moonlight.webp'
import campusArtwork from './huischool-campus-sunlight.webp'
import './school-landing.css'

export type SchoolRegistrationEntry =
  | { kind: 'STUDENT'; organizationId: string; classUnitId: string }
  | { kind: 'PARENT' }
  | { kind: 'STAFF'; role: 'TEACHER' | 'COUNSELOR' | 'ADMIN' }

export function SchoolPublicHeader({ onHome, onLogin, onRegister, onExplore, home, appearance }: {
  onHome: () => void; onLogin: () => void; onRegister: () => void
  onExplore: (id: string) => void; home: boolean; appearance?: ProductAppearanceState
}) {
  const [open, setOpen] = useState(false)
  const menuButton = useRef<HTMLButtonElement>(null)
  const header = useRef<HTMLElement>(null)
  useEffect(() => {
    if (!open) return
    const close = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { setOpen(false); menuButton.current?.focus() }
    }
    const outside = (event: PointerEvent) => {
      if (!header.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('keydown', close)
    document.addEventListener('pointerdown', outside)
    return () => { document.removeEventListener('keydown', close); document.removeEventListener('pointerdown', outside) }
  }, [open])
  const act = (action: () => void) => { setOpen(false); action() }
  return <header className={`hs-public-header${home ? ' hs-public-header--landing' : ''}`} ref={header}>
    <button className="hs-home-link" type="button" onClick={() => act(onHome)} aria-label="School 首页"><SchoolMark home={home} /></button>
    <nav className={`hs-public-nav${open ? ' hs-public-nav-open' : ''}`} id="hs-public-navigation" aria-label="校园导航">
      <button type="button" onClick={() => act(onHome)} aria-current={home ? 'page' : undefined}>首页</button>
      <a href="#hs-features" onClick={event => { event.preventDefault(); act(() => onExplore('hs-features')) }}>产品功能</a>
      {!home && appearance && <ProductThemeControl appearance={appearance} product="School"/>}
    </nav>
    <div className="hs-header-actions" aria-label="校园账号入口">
      <button type="button" className={`hs-login-entry${home ? ' hs-primary' : ''}`} onClick={() => act(onLogin)}>登录</button>
      <button type="button" className={`hs-register-entry${home ? '' : ' hs-primary'}`} onClick={() => act(onRegister)}>注册</button>
      {home && appearance && <ProductThemeControl appearance={appearance} product="School"/>}
    </div>
    <div className="hs-navigation-toggle">
      <button type="button" className="hs-menu-toggle" ref={menuButton} aria-expanded={open} aria-controls="hs-public-navigation"
        aria-label={open ? '关闭菜单' : '打开菜单'} onClick={() => setOpen(value => !value)}>
        {open ? <X size={22} aria-hidden="true" /> : <Menu size={22} aria-hidden="true" />}
      </button>
    </div>
  </header>
}

export function SchoolLanding({ onJoin, theme = 'light' }: { onJoin: () => void; theme?: ProductTheme }) {
  return <>
    <section className="hs-landing-hero" aria-labelledby="hs-landing-title">
      <img className="hs-campus-art" src={theme === 'dark' ? campusMoonlight : campusArtwork} width="1536" height="1024" fetchPriority="high"
        alt={theme === 'dark' ? '月光穿过树冠，四名学生背对镜头坐在草地上，远处的校园亮着温暖的窗灯。' : '阳光穿过树冠，四名学生背对镜头坐在草地上，远处是明亮的校园。'} />
      <div className="hs-landing-copy">
        <h1 id="hs-landing-title"><span>在更好的环境中</span><span>看见每一个独特的你</span></h1>
        <p>科学支持 · 专业陪伴 · 健康成长</p>
        <div className="hs-hero-actions">
          <button className="hs-primary" type="button" onClick={onJoin}>立即加入</button>
          <a href="#hs-features">了解更多 <ArrowRight size={18} aria-hidden="true" /></a>
        </div>
      </div>
      <section id="hs-features" className="hs-feature-strip" aria-label="校园成长支持" tabIndex={-1}>
        {schoolFeatures.map(({ path, title, description, icon: Icon }, index) => <a className="hs-feature" key={path}
          href={path} aria-labelledby={`hs-feature-title-${index}`} aria-describedby={`hs-feature-description-${index}`}>
          <Icon size={34} strokeWidth={1.7} aria-hidden="true" /><h2 id={`hs-feature-title-${index}`}>{title}</h2>
          <p id={`hs-feature-description-${index}`}>{description}</p>
        </a>)}
      </section>
    </section>
  </>
}

export function SchoolCodeRegistration({ api, onResolved, onLogin }: {
  api: (path: string, method?: string, payload?: unknown) => Promise<SchoolRegistrationEntry>
  onResolved: (entry: SchoolRegistrationEntry, code: string) => void
  onLogin: () => void
}) {
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const sequence = useRef(0)
  useEffect(() => () => { sequence.current++ }, [])
  async function submit(event: React.FormEvent) {
    event.preventDefault()
    const attempt = ++sequence.current
    setBusy(true); setError('')
    try {
      const entry = await api('/registration/resolve', 'POST', { code: code.trim() })
      if (attempt === sequence.current) onResolved(entry, code.trim())
    } catch (cause) {
      if (attempt === sequence.current) setError(cause instanceof Error ? cause.message : '注册码暂不可用，请核实或联系学校')
    } finally { if (attempt === sequence.current) setBusy(false) }
  }
  return <section className="hs-code-page" aria-labelledby="hs-code-title">
    <div className="hs-code-panel">
      <p className="hs-section-kicker">欢迎来到 School</p>
      <h1 id="hs-code-title" tabIndex={-1}>创建校园账号</h1>
      <p className="hs-code-intro">先输入收到的注册码，我们会带你完成对应的账号信息。</p>
      {error && <p className="hs-alert" role="alert">{error}</p>}
      <form onSubmit={event => void submit(event)}>
        <label className="hs-field"><span>注册码</span><input value={code} onChange={event => setCode(event.target.value)}
          disabled={busy} autoComplete="off" autoCapitalize="none" spellCheck={false} required minLength={24} maxLength={64}
          placeholder="请输入注册码" aria-describedby="hs-code-help" /></label>
        <button type="submit" className="hs-primary" disabled={busy}>{busy ? '正在核验…' : '继续注册'}<ArrowRight size={18} aria-hidden="true" /></button>
      </form>
      <p id="hs-code-help" className="hs-code-help">还没有注册码？请联系学校；家长可向孩子获取亲子邀请码。</p>
      <p className="hs-join-login">已有校园账号？<button type="button" onClick={onLogin}>登录</button></p>
    </div>
  </section>
}
