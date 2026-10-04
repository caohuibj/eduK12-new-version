import { useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { organizationInvitationsApi } from '../../api/organizationInvitations'
import { useAuth } from '../../contexts/AuthContext'
import { useOrganization } from '../../contexts/OrganizationContext'
import {
  PageHeader,
  ProductButton,
  ProductPage,
  ProductStatus,
} from '../../components/product-ui'
import { resourceError } from '../../hooks/useSessionResource'
type Preview = Awaited<ReturnType<typeof organizationInvitationsApi.preview>>
function Content() {
  const [code, setCode] = useState(''),
    [preview, setPreview] = useState<Preview | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    lock = useRef(false),
    command = useRef(crypto.randomUUID()),
    navigate = useNavigate(),
    { refresh } = useOrganization()
  return (
    <>
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault()
          if (lock.current) return
          lock.current = true
          setBusy(true)
          setError('')
          setPreview(null)
          try {
            setPreview(await organizationInvitationsApi.preview(code.trim()))
          } catch (err) {
            setError(resourceError(err))
          } finally {
            lock.current = false
            setBusy(false)
          }
        }}
      >
        <label className="block">
          组织成员邀请码
          <input
            className="input mt-1"
            autoComplete="off"
            disabled={busy}
            value={code}
            minLength={24}
            maxLength={24}
            onChange={(e) => {
              setCode(e.target.value)
              setPreview(null)
              command.current = crypto.randomUUID()
            }}
            required
          />
        </label>
        <ProductButton
          type="submit"
          disabled={busy || code.trim().length !== 24}
        >
          核对邀请
        </ProductButton>
      </form>
      {error && (
        <ProductStatus kind="error" title="邀请不可用">
          {error}
        </ProductStatus>
      )}
      {preview && (
        <section className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
          <h2 className="font-semibold">{preview.organization.name}</h2>
          <p>
            将加入为普通成员
            {preview.persona
              ? `，工作身份：${{ TEACHER: '教师', STUDENT: '学生', COUNSELOR: '咨询人员', CLIENT: '咨询对象' }[preview.persona]}`
              : ''}
            。
          </p>
          {preview.alreadyMember ? (
            <Link
              to={`/organizations/${encodeURIComponent(preview.organization.id)}`}
            >
              您已是成员，进入组织
            </Link>
          ) : (
            <ProductButton
              variant="primary"
              disabled={busy}
              onClick={async () => {
                if (lock.current) return
                lock.current = true
                setBusy(true)
                setError('')
                try {
                  const result = await organizationInvitationsApi.accept(
                    code.trim(),
                    command.current,
                  )
                  await refresh()
                  navigate(
                    `/organizations/${encodeURIComponent(result.organizationId)}`,
                  )
                } catch (err) {
                  setError(
                    resourceError(err, '加入结果未确认，请核对组织列表后重试'),
                  )
                  setPreview(null)
                } finally {
                  lock.current = false
                  setBusy(false)
                }
              }}
            >
              确认加入这个组织
            </ProductButton>
          )}
        </section>
      )}
    </>
  )
}
export default function OrganizationInvitationPage() {
  const { user } = useAuth()
  return (
    <ProductPage width="reading">
      <PageHeader
        title="使用邀请码加入组织"
        description="登录后核对学校提供的成员邀请。"
        actions={<Link to="/organizations">返回组织列表</Link>}
      />
      <Content key={user?.id} />
    </ProductPage>
  )
}
