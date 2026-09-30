import { useEffect, useState } from 'react'
import { organizationApi } from '../../api/organizations'
import { ProductButton } from '../../components/product-ui'

export default function DeliveryPolicySettings({ organizationId }: { organizationId: string }) {
  const [enabled, setEnabled] = useState<boolean | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  useEffect(() => {
    let active = true
    setEnabled(null); setMessage('')
    void (async () => {
      try { const policy = await organizationApi.readDeliveryPolicy(organizationId); if (active) setEnabled(policy.homeroomDeliveryEnabled) }
      catch { if (active) setMessage('无法加载投放策略，请刷新重试。') }
    })()
    return () => { active = false }
  }, [organizationId])
  const save = async () => {
    if (enabled === null) return
    setBusy(true)
    try { const result = await organizationApi.updateDeliveryPolicy(organizationId, !enabled); setEnabled(result.homeroomDeliveryEnabled); setMessage('投放策略已更新。') }
    catch { setMessage('更新失败，原策略未变更。') }
    finally { setBusy(false) }
  }
  return <section className="my-4 space-y-3 rounded-xl border bg-white p-4">
    <h2 className="font-semibold">教师测评投放策略</h2>
    <p>班主任默认投放：{enabled === null ? '加载中' : enabled ? '允许本班' : '关闭'}。任课教师须按班授权。关闭默认后，班主任也须取得显式授权。</p>
    <ProductButton disabled={busy || enabled === null} onClick={() => void save()}>{enabled ? '关闭班主任默认投放' : '允许班主任默认投放'}</ProductButton>
    {message && <p role="status">{message}</p>}
  </section>
}
