import { useEffect, useRef, useState } from 'react'
import {licenseAssignmentPath} from '../../admin/standardAssignmentTarget'
import type {Product} from '../../admin/toolLicenseFocus'
import {productOrigins} from '../../products/origins'
import './own-tool-license.css'

export type OwnToolLicenseView = {
  enforcing: boolean
  license: {
    product?: Product
    subjectId?: string
    startsAt: string
    expiresAt: string
    status: 'SCHEDULED' | 'ACTIVE' | 'EXPIRED' | 'TERMINATED'
    tools: Array<{ key: string; name: string; limit: number | null; used: number; reserved?: number | null; assignment: 'RECORDED' | 'PENDING' | 'CHECK_IN_CATALOG' }>
  } | null
}

const statuses = { SCHEDULED: '待生效', ACTIVE: '有效', EXPIRED: '已到期', TERMINATED: '已终止' }
const assignments = { RECORDED: '有精确分配记录', PENDING: '待入口管理员分配', CHECK_IN_CATALOG: '请在工具目录核对版本' }
const localTime = new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeStyle: 'short' })

export default function OwnToolLicense({ title, load, onOpenSources }: {
  title: string
  load: () => Promise<OwnToolLicenseView>
  onOpenSources?: () => void
}) {
  const [expanded, setExpanded] = useState(false)
  const [result, setResult] = useState<OwnToolLicenseView | null>(null)
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)
  const current = useRef(0)
  useEffect(() => () => { current.current++ }, [])

  const origin=productOrigins()?.admin
  const license=result?.license
  async function read() {
    const request = ++current.current
    setError('')
    setResult(null)
    setPending(true)
    try {
      const data = await load()
      if (current.current === request) setResult(data)
    } catch (cause) {
      if (current.current === request) setError(cause instanceof Error ? cause.message : '读取工具许可失败')
    } finally {
      if (current.current === request) setPending(false)
    }
  }

  return <details className="own-tool-license" onToggle={event => {
    const open = event.currentTarget.open
    setExpanded(open)
    if (open) void read()
  }}>
    <summary>{title}</summary>
    {expanded && <div className="own-tool-license-body">
      {pending && <p role="status">正在读取工具许可…</p>}
      {error && <p role="alert">{error}</p>}
      {result && <>
        {!result.license && <p>暂无已签发的商业工具许可。当前工具使用按入口的已有权限执行。</p>}
        {result.license && <>
          <div className="own-tool-license-period"><strong>{statuses[result.license.status]}</strong>
            <span><time dateTime={result.license.startsAt}>{localTime.format(new Date(result.license.startsAt))}</time> 至 <time dateTime={result.license.expiresAt}>{localTime.format(new Date(result.license.expiresAt))}</time></span></div>
          {!result.enforcing && <p>此入口的商业发布校验尚未启用。</p>}
          <ul className="own-tool-license-list">{result.license.tools.map(tool => <li key={tool.key}>
            <div><strong>{tool.name}</strong>{result.license?.status==='ACTIVE'&&<small>{assignments[tool.assignment]}</small>}{origin&&license?.product&&license.subjectId&&license.status==='ACTIVE'&&tool.key.startsWith('SCALE:')&&tool.assignment==='PENDING'&&
              <a href={origin+licenseAssignmentPath(license.product,license.subjectId,tool.key)}>由 {license.product} 入口管理员分配版本</a>}</div>
            <span>{typeof tool.reserved==='number' ? `可用 ${tool.limit===null?'不限':tool.limit-tool.used} · 活动预留 ${tool.reserved} · 已结算使用 ${tool.used-tool.reserved}` : tool.limit === null ? '不限次数' : `剩余 ${Math.max(0, tool.limit - tool.used)} / ${tool.limit} 次`}</span>
          </li>)}</ul>
          <p>选用时请核对工具的具体可用版本。缺少精确配置时，请由入口管理员分配。</p>
        </>}
      </>}
      <div className="own-tool-license-actions">
        {onOpenSources && <button type="button" onClick={onOpenSources}>查看已分配版本</button>}
        <button type="button" onClick={() => void read()} disabled={pending}>刷新许可</button>
      </div>
    </div>}
  </details>
}
