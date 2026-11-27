import { useEffect, useRef, useState } from 'react'
import {licenseAssignmentPath} from '../../admin/standardAssignmentTarget'
import {products,toolLicenseReviewPath,type Product} from '../../admin/toolLicenseFocus'
import {toolLicenseRolloutLabel,type ToolLicenseEnrollment} from '../../admin/toolLicenseRollout'
import {productOrigins} from '../../products/origins'
import './own-tool-license.css'

export type OwnToolLicenseView = {
  enforcing: boolean
  enrollment?:ToolLicenseEnrollment
  license: {
    product?: Product
    subjectId?: string
    startsAt: string
    expiresAt: string
    status: 'SCHEDULED' | 'ACTIVE' | 'EXPIRED' | 'TERMINATED'
    tools: Array<{ key: string; name: string; limit: number | null; used: number; reserved?: number | null; assignment: keyof typeof assignments; canAssignVersion?:boolean; reselectIfPinned?:boolean }>
  } | null
}

const statuses = { SCHEDULED: '待生效', ACTIVE: '有效', EXPIRED: '已到期', TERMINATED: '已终止' }
const assignments = {
  RECORDED: '已有当前可用的固定配置',
  PENDING: '待入口管理员分配',
  AUTHORITY_LOST: '原签发资格或委托已失效，请联系本入口管理员重新分配',
  VERSION_UNAVAILABLE: '当前没有可分配版本，请联系系统管理员核对工具准入',
  CHECK_IN_CATALOG: '请在工具目录核对版本',
}
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
        {result.enrollment&&<p>{toolLicenseRolloutLabel(result.enrollment,value=>localTime.format(new Date(value)))}</p>}
        {!result.license && <p>暂无已签发的商业工具许可。</p>}
        {result.license && <>
          <div className="own-tool-license-period"><strong>{statuses[result.license.status]}</strong>
            <span><time dateTime={result.license.startsAt}>{localTime.format(new Date(result.license.startsAt))}</time> 至 <time dateTime={result.license.expiresAt}>{localTime.format(new Date(result.license.expiresAt))}</time></span></div>
          {!result.enforcing&&!result.enrollment&&<p>此入口的商业发布校验尚未启用。</p>}
          <ul className="own-tool-license-list">{result.license.tools.map(tool => {
            const active=license?.status==='ACTIVE'
            const available=tool.limit===null?null:Math.max(0,tool.limit-tool.used)
            const needsAssignment=(tool.assignment==='PENDING'||tool.assignment==='AUTHORITY_LOST')&&
              (tool.canAssignVersion??tool.key.startsWith('SCALE:'))
            return <li key={tool.key}>
              <div>
                <strong>{tool.name}</strong>
                {active&&<small>{assignments[tool.assignment]}</small>}
                {active&&tool.reselectIfPinned&&<small>若草稿仍绑定原配置，请在发布前重新选择可用版本。</small>}
                {active&&origin&&license?.product&&license.subjectId&&needsAssignment&&
                  <small><a href={origin+licenseAssignmentPath(license.product,license.subjectId,tool.key)}>
                    由 {products[license.product]} 入口管理员分配版本</a></small>}
                {active&&available===0&&<small>额度不足，请联系系统管理员调整许可。
                  {origin&&license?.product&&license.subjectId&&<> <a href={origin+toolLicenseReviewPath(license.product,license.subjectId,tool.key)}>
                    查看对应工具许可</a></>}
                </small>}
              </div>
              <span>{typeof tool.reserved==='number'
                ? `可用 ${available??'不限'} · 活动预留 ${tool.reserved} · 已结算使用 ${tool.used-tool.reserved}`
                : available===null?'不限次数':`剩余 ${available} / ${tool.limit} 次`}</span>
            </li>
          })}</ul>
        </>}
      </>}
      <div className="own-tool-license-actions">
        {onOpenSources && <button type="button" onClick={onOpenSources}>查看已分配版本</button>}
        <button type="button" onClick={() => void read()} disabled={pending}>刷新许可</button>
      </div>
    </div>}
  </details>
}
