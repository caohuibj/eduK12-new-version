import { useState } from 'react'
import ManagementDialog from './ManagementDialog'

export interface TemporaryPasswordHandoffValue {
  studentName: string
  username: string
  temporaryPassword: string
}

/**
 * Transient, deliberately non-persistent credential handoff.
 * A password is provided only by the authorized course reset response.
 * Never save the value to local/session storage, URL, logs or analytics.
 */
export default function TemporaryPasswordHandoff({
  value, onClose,
}: {
  value: TemporaryPasswordHandoffValue | null
  onClose: () => void
}) {
  const [copyNotice, setCopyNotice] = useState('')
  async function copy() {
    if (!value || !navigator.clipboard?.writeText) {
      setCopyNotice('无法自动复制，请手动选中临时密码。')
      return
    }
    try {
      await navigator.clipboard.writeText(value.temporaryPassword)
      setCopyNotice('已复制。请通过私密、安全的方式交给学员。')
    } catch {
      setCopyNotice('复制失败，请手动选中临时密码。')
    }
  }
  return <ManagementDialog
    open={Boolean(value)}
    title="学员临时密码"
    description="此密码只展示一次。关闭后不可再次查看；如果丢失，需要重新发起重置。"
    width="compact"
    onClose={() => { setCopyNotice(''); onClose() }}
    actions={<button type="button" className="btn-primary" onClick={() => { setCopyNotice(''); onClose() }}>我已安全交付，关闭</button>}
  >
    {value && <div className="space-y-3">
      <p>学员：<strong>{value.studentName}</strong></p>
      <p>登录账号：<strong>{value.username}</strong></p>
      <div className="rounded border border-amber-200 bg-amber-50 p-3">
        <p className="text-sm font-semibold text-amber-900">登录临时密码（仅本次显示）</p>
        <code aria-label="临时密码" className="mt-2 block break-all select-all text-lg font-semibold text-slate-900">{value.temporaryPassword}</code>
      </div>
      <button type="button" className="btn-secondary min-h-11" onClick={() => void copy()}>复制临时密码</button>
      {copyNotice && <p role="status" className="text-sm">{copyNotice}</p>}
      <p className="text-sm leading-7 text-slate-700">
        此操作已令该学员的旧登录会话失效，并要求其首次使用临时密码登录后立即修改。
        这是整个 Huisurvey 账号的密码，不只是本门课程。请勿在群聊、公开文档中发送。
      </p>
    </div>}
  </ManagementDialog>
}
