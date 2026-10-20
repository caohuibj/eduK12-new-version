import { useId, useState, type ReactNode } from 'react'
import { Copy, Link2, RefreshCw, ShieldCheck } from 'lucide-react'
import LocalDateTimeInput, { localDateTimeValue } from './LocalDateTimeInput'
import { publicLinkStatus, type PublicDeliveryLink } from '../api/publicDelivery'
import './training-public-delivery.css'

interface Props {
 links: PublicDeliveryLink[]; busy: boolean; error: string; notice: string; canCreate: boolean
 maximumExpiry?: string | null; expiresAt: string; maxUses: string
 groupIpEligible: boolean; groupIpEnabled: boolean; groupTimeZone: string
 onExpiry: (value: string) => void; onMaxUses: (value: string) => void
 onGroupIp: (value: boolean) => void; onTimeZone: (value: string) => void
 onCreate: () => void; onRefresh: () => void
 onCopy: (link: PublicDeliveryLink) => void; onDisable: (link: PublicDeliveryLink) => void
 publicEntry: (link: PublicDeliveryLink) => string | null; research?: ReactNode
}

/** Guided presentation; existing delivery adapters own validation, permissions and mutations. */
export function TrainingPublicDelivery(props: Props) {
 const { links, busy, error, notice, canCreate, maximumExpiry, expiresAt, maxUses, groupIpEligible, groupIpEnabled, groupTimeZone } = props
 const fieldId = useId()
 const [researchOpened, setResearchOpened] = useState(false)
 const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone
 return <section className="training-public-delivery" aria-label="匿名作答链接管理">
  <header className="tal-heading"><span className="tal-icon"><Link2 size={22} aria-hidden="true"/></span><div><span className="tal-eyebrow">分享与收集</span><h2>匿名作答链接</h2><p>参与者无需账号登录。先设有效期，生成链接后即可复制分享。</p></div></header>
  <ol className="tal-steps" aria-label="匿名链接使用步骤"><li><span>01</span>设置有效期</li><li><span>02</span>生成链接</li><li><span>03</span>复制并分享</li></ol>
  {error && <p role="alert" className="tal-message is-error">{error}</p>}
  {notice && <p role="status" className="tal-message">{notice}</p>}
  {canCreate ? <div className="tal-create">
   <div className="tal-create-heading"><h3>生成普通匿名链接</h3><span>日常课程测评使用这一项即可</span></div>
   <div className="tal-basic-fields"><div><label htmlFor={fieldId}>链接有效期 <span>必填</span></label><LocalDateTimeInput picker id={fieldId} aria-label="有效期" aria-describedby={fieldId+'-help'} value={expiresAt} onChange={event => props.onExpiry(event.target.value)} disabled={busy}/>
    <p id={fieldId+'-help'}>按设备时区 {timeZone} 设置。{maximumExpiry ? '不能晚于下方的测评截止时间。' : '请选择未来的日期和时间。'}</p>
   </div><button type="button" className="tal-primary" disabled={busy} onClick={props.onCreate}><Link2 size={16} aria-hidden="true"/>{busy ? '正在处理…' : '生成新链接'}</button></div>
   {maximumExpiry && <div className="tal-deadline"><span>测评截止：{new Date(maximumExpiry).toLocaleString('zh-CN')}</span><button type="button" disabled={busy} onClick={() => props.onExpiry(localDateTimeValue(maximumExpiry))}>沿用测评截止时间</button></div>}
   <details className="tal-help"><summary>链接有效期和测评截止时间有什么区别？</summary><p>链接有效期控制新的进入资格；已开始的作答仍按测评自身的截止时间和恢复规则处理。复制链接不会延长有效期。</p></details>
   <details className="tal-optional" open={groupIpEnabled || maxUses !== '0' || undefined}><summary><span><strong>参与次数与课堂网络设置</strong><small>按需限制参与次数，或允许同一网络下集体作答。</small></span><em>可选</em></summary><div className="tal-optional-body">
    <label htmlFor={fieldId+'-quota'}>最大参与次数（0 表示不限）</label><input id={fieldId+'-quota'} type="number" min="0" max="2147483647" step="1" value={maxUses} onChange={event => props.onMaxUses(event.target.value)} disabled={busy}/><p>这里限制的是参与次数，不是去重人数。一般课堂测评可保留 0，按测评原有规则作答。</p>
    {groupIpEligible && <div className="tal-network"><label><input type="checkbox" checked={groupIpEnabled} disabled={busy} onChange={event => props.onGroupIp(event.target.checked)}/>为此新链接启用同 IP 集体作答短窗口</label><p>适合同一教室、同一 Wi-Fi 下集中作答；普通分散作答可保持关闭。</p>
     {groupIpEnabled && <><label htmlFor={fieldId+'-timezone'}>窗口时区（IANA）</label><input id={fieldId+'-timezone'} value={groupTimeZone} disabled={busy} onChange={event => props.onTimeZone(event.target.value)}/><p>生成时立即开放并冻结新轮次；上方有效期是结束时间，最长 48 小时，且不能晚于测评截止时间。冻结后不可延长。</p><details className="tal-help"><summary>已有作答和恢复凭证会受到影响吗？</summary><p>仅影响此新公开链接的新准入，登录和账号限流保持不变。已有恢复凭证仍按原作答规则恢复；轮次提示不能代替链接或恢复凭证。</p></details></>}
    </div>}
   </div></details>
  </div> : <p className="tal-message">发布测评后，即可在这里生成匿名链接。</p>}

  <section className="tal-links" aria-label="已生成的匿名链接"><div className="tal-list-heading"><div><h3>已生成的链接 <span>{links.length}</span></h3><p>复制已有链接即可分享，无需为每位参与者重复生成。</p></div><button type="button" className="tal-secondary" disabled={busy} onClick={props.onRefresh}><RefreshCw size={14} aria-hidden="true"/>刷新链接</button></div>
   {!links.length && !busy && !error && <div className="tal-empty"><Link2 size={25} aria-hidden="true"/><p>尚未生成链接</p><span>填写上方有效期，点击“生成新链接”。</span></div>}
   {links.map((link, index) => { const url = props.publicEntry(link); return <article key={link.id} className="tal-link-card"><div className="tal-link-title"><h4>匿名链接 {index + 1}</h4><span className={'tal-link-status '+(publicLinkStatus(link)==='使用中'?'is-active':'')}>{publicLinkStatus(link)}</span></div>
    {url ? <a className="tal-url" href={url}>{url}</a> : <p className="tal-hidden-url">链接地址已隐藏，复制时会重新验证权限。</p>}
    <dl><div><dt>有效期至</dt><dd>{new Date(link.expiresAt).toLocaleString('zh-CN')}</dd></div><div><dt>已使用 / 最大次数</dt><dd>{link.usedCount} / {link.maxUses || '不限'}</dd></div></dl>
    <div className="tal-link-actions"><button type="button" className="tal-primary" disabled={busy} onClick={() => props.onCopy(link)}><Copy size={14} aria-hidden="true"/>复制链接</button><details className="tal-link-more"><summary>详细信息与停用</summary><div><p>创建于：{link.createdAt ? new Date(link.createdAt).toLocaleString('zh-CN') : '刚刚'}</p>{link.roundId && link.groupIpWindow && <p>同 IP 短窗口：{new Date(link.groupIpWindow.opensAt).toLocaleString('zh-CN')} 至 {new Date(link.groupIpWindow.closesAt).toLocaleString('zh-CN')}（{timeZone}）。轮次：{link.roundId}。最长 48 小时，到期不再接收新参与者。</p>}{link.isActive && <><p>停用后不再接受新参与者，请按原作答规则处理已有作答。</p><button type="button" className="tal-stop" disabled={busy} onClick={() => props.onDisable(link)}>停用此链接</button></>}</div></details></div>
   </article> })}
  </section>
  {props.research && <details className="tal-research" onToggle={event => { if (event.currentTarget.open) setResearchOpened(true) }}><summary><span className="tal-icon"><ShieldCheck size={19} aria-hidden="true"/></span><span><strong>同一批匿名参与者，需要多次测评？</strong><small>展开匿名研究与波次管理，关联研究内身份及多次报告。</small></span><em>进阶</em></summary><div className="tal-research-body"><p className="tal-research-guide">按“建立研究 → 发布研究同意 → 建立测评波次 → 复制研究入口”操作。仅做一次普通测评时，使用上方匿名链接即可。</p>{researchOpened && props.research}</div></details>}
  <p className="tal-permission">参与者的个人反馈、教师查看和导出范围，继续遵循当前测评权限。</p>
 </section>
}
