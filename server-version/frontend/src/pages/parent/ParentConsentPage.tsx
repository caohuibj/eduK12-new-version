import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { parentsApi, type ConsentPreview } from '../../api/parents'
import { useAuth } from '../../contexts/AuthContext'
import {
  DiscoveryCard,
  PageHeader,
  ProductButton,
  ProductPage,
  ProductStatus,
} from '../../components/product-ui'
import ParentFeature from './ParentFeature'
import ParentReportView from './ParentReportView'
import { parentError, useParentResource } from './useParentResource'
type Options = {
  list: Array<{ id: string; title: string; canConsent: boolean }>
  truncated: boolean
}
function Content({
  relationshipId,
  artifactId,
}: {
  relationshipId: string
  artifactId?: string
}) {
  const load = useCallback(
    async (signal: AbortSignal): Promise<ConsentPreview | Options> =>
      artifactId
        ? parentsApi.previewConsent(relationshipId, artifactId, signal)
        : parentsApi.reportOptions(relationshipId, signal),
    [relationshipId, artifactId],
  )
  const { data, error, loading, reload } = useParentResource(
      `consent:${relationshipId}:${artifactId ?? ''}`,
      load,
    ),
    [checked, setChecked] = useState(false),
    [busy, setBusy] = useState(false),
    [failure, setFailure] = useState(''),
    [notice, setNotice] = useState(''),
    lock = useRef(false)
  const act = async (action: () => Promise<unknown>, message: string) => {
    if (lock.current) return
    lock.current = true
    setBusy(true)
    setFailure('')
    setNotice('')
    try {
      await action()
      setNotice(message)
      reload()
    } catch (err) {
      setFailure(parentError(err, '状态已变化，请刷新核对'))
      reload()
    } finally {
      lock.current = false
      setBusy(false)
    }
  }
  useEffect(() => setChecked(false), [data])
  if (loading)
    return (
      <ProductStatus kind="pending" title="正在加载授权内容">
        请稍候。
      </ProductStatus>
    )
  if (error || !data)
    return (
      <ProductStatus
        kind="error"
        title="授权内容不可用"
        actions={<ProductButton onClick={reload}>重试</ProductButton>}
      >
        {error}
      </ProductStatus>
    )
  if ('list' in data)
    return (
      <div className="space-y-4">
        {data.list.length ? (
          data.list.map((report) => (
            <DiscoveryCard
              key={report.id}
              to={`/student/parent-links/${encodeURIComponent(relationshipId)}/reports/${encodeURIComponent(report.id)}`}
              title={report.title}
              description="预览并管理这份报告的家长授权"
            />
          ))
        ) : (
          <ProductStatus kind="info" title="暂无可授权报告">
            学校需要先发布家长专用报告。
          </ProductStatus>
        )}
        {data.truncated && <p>报告较多，请联系学校核对更多内容。</p>}
      </div>
    )
  return (
    <div className="space-y-5">
      {failure && (
        <ProductStatus
          kind="error"
          title="操作未确认"
          actions={<ProductButton onClick={reload}>刷新核对</ProductButton>}
        >
          {failure}
        </ProductStatus>
      )}
      {notice && (
        <ProductStatus kind="success" title="操作完成">
          {notice}
        </ProductStatus>
      )}
      <p>
        接收家长：<strong>{data.parentName}</strong>
      </p>
      <ParentReportView report={data.projection} />
      <p>{data.consentText}</p>
      {data.consentStatus === 'ACCEPTED' ? (
        <ProductStatus kind="success" title="已同意当前报告版本">
          还需报告负责人逐份授权；您可以随时撤回。
        </ProductStatus>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault()
            if (!checked) return
            void act(() => parentsApi.acceptConsent(data), '已同意本份报告')
          }}
        >
          <label className="flex gap-2 mb-4">
            <input
              type="checkbox"
              required
              disabled={busy}
              checked={checked}
              onChange={(e) => setChecked(e.target.checked)}
            />
            我已核对接收家长及这份报告内容，同意以上说明
          </label>
          <ProductButton
            type="submit"
            variant="primary"
            disabled={busy || !checked || !data.canConsent}
          >
            同意这份报告
          </ProductButton>
        </form>
      )}
      {data.canRevoke && (
        <ProductButton
          variant="danger"
          disabled={busy}
          onClick={() => {
            if (
              window.confirm(
                '撤回后，这位家长将无法继续读取本份报告。其他报告和家长关联保持有效。',
              )
            )
              void act(
                () => parentsApi.withdraw(relationshipId, artifactId!),
                '本份报告授权已撤回',
              )
          }}
        >
          撤回本份报告授权
        </ProductButton>
      )}
    </div>
  )
}
export default function ParentConsentPage() {
  const { relationshipId = '', artifactId } = useParams(),
    { user } = useAuth()
  return (
    <ProductPage width="reading">
      <PageHeader
        title={artifactId ? '报告授权预览' : '管理报告授权'}
        actions={<Link to="/student/parent-links">返回家长关联</Link>}
      />
      <ParentFeature>
        <Content
          key={`${user?.id}:${relationshipId}:${artifactId ?? ''}`}
          relationshipId={relationshipId}
          artifactId={artifactId}
        />
      </ParentFeature>
    </ProductPage>
  )
}
