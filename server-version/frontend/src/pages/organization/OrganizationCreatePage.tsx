import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { organizationApi } from '../../api/organizations'
import { useOrganization } from '../../contexts/OrganizationContext'
import { PageHeader, ProductButton, ProductPage, ProductStatus } from '../../components/product-ui'

export default function OrganizationCreatePage() {
  const [allowed, setAllowed] = useState(false)
  const [name, setName] = useState('')
  const [firstAdminUserId, setFirstAdminUserId] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { refresh } = useOrganization()
  const navigate = useNavigate()
  useEffect(() => {
    let cancelled = false
    void organizationApi.list(1, 1).then(result => {
      if (!cancelled) setAllowed(result.allowedActions.includes('CREATE_ORGANIZATION'))
    }).catch(err => { if (!cancelled) setError(err instanceof Error ? err.message : '权限读取失败') })
    return () => { cancelled = true }
  }, [])
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      const result = await organizationApi.create(name.trim(), firstAdminUserId.trim())
      await refresh()
      navigate(`/organizations/${encodeURIComponent(result.organization.id)}`)
    } catch (err) { setError(err instanceof Error ? err.message : '创建失败') }
    finally { setBusy(false) }
  }
  return <ProductPage><PageHeader title="创建组织" description="平台管理员创建组织，同时指定首位组织管理员；组织与管理员关系在同一事务中保存。" />
    {error && <ProductStatus kind="error" title="无法创建组织">{error}</ProductStatus>}
    {allowed ? <form onSubmit={submit} className="grid max-w-xl gap-4">
      <label>组织名称<input className="ml-3 min-h-11 rounded border px-3" required value={name} onChange={event => setName(event.target.value)} /></label>
      <label>首位管理员用户 ID<input className="ml-3 min-h-11 rounded border px-3" required value={firstAdminUserId} onChange={event => setFirstAdminUserId(event.target.value)} /></label>
      <ProductButton type="submit" disabled={busy}>创建组织</ProductButton>
    </form> : <p>当前服务器未授予组织创建权限。</p>}
  </ProductPage>
}
