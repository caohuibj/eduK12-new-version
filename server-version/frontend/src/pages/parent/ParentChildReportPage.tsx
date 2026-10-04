import { useCallback, useEffect, useRef, useState } from 'react'
import ManagementDialog from '../../components/staff-ui/ManagementDialog'
import { Link, useParams } from 'react-router-dom'
import { parentsApi } from '../../api/parents'
import { useAuth } from '../../contexts/AuthContext'
import {
  PageHeader,
  ProductButton,
  ProductPage,
  ProductStatus,
} from '../../components/product-ui'
import ParentFeature from './ParentFeature'
import ParentReportView from './ParentReportView'
import { useParentResource } from './useParentResource'
function Content({
  childId,
  artifactId,
}: {
  childId: string
  artifactId: string
}) {
  const load = useCallback(
    (signal: AbortSignal) => parentsApi.report(childId, artifactId, signal),
    [childId, artifactId],
  )
  const { data, error, loading, reload } = useParentResource(
    `report:${childId}:${artifactId}`,
    load,
  )
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [revoked, setRevoked] = useState(false)
  const [withdrawError, setWithdrawError] = useState('')
  const alive = useRef(true)
  const lock = useRef(false)
  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])
  const withdraw = async () => {
    if (!data?.canRevoke || lock.current) return
    lock.current = true
    setBusy(true)
    setWithdrawError('')
    try {
      await parentsApi.withdraw(data.relationshipId, data.artifactId)
      if (!alive.current) return
      setConfirming(false)
      setRevoked(true)
    } catch (err) {
      if (alive.current)
        setWithdrawError(
          err instanceof Error ? err.message : '撤回未完成，请重试',
        )
    } finally {
      lock.current = false
      if (alive.current) setBusy(false)
    }
  }
  if (revoked)
    return (
      <ProductStatus kind="success" title="本份报告授权已撤回">
        您与孩子的关联仍然保留，其他报告的授权不受影响。查看本份报告需要重新获得授权。
      </ProductStatus>
    )
  if (loading)
    return (
      <ProductStatus kind="pending" title="正在加载报告">
        请稍候。
      </ProductStatus>
    )
  if (error || !data)
    return (
      <ProductStatus
        kind="error"
        title="报告暂时不可查看"
        actions={<ProductButton onClick={reload}>重新加载</ProductButton>}
      >
        {error || '关联或报告授权可能已失效，请返回列表核对。'}
      </ProductStatus>
    )
  return (
    <div className="space-y-5">
      <ParentReportView report={data} />
      {data.canRevoke && (
        <ProductButton variant="danger" onClick={() => setConfirming(true)}>
          停止查看本份报告
        </ProductButton>
      )}
      <ManagementDialog
        open={confirming}
        title="停止查看本份报告"
        onClose={() => setConfirming(false)}
        closeDisabled={busy}
        actions={
          <>
            <ProductButton disabled={busy} onClick={() => setConfirming(false)}>
              取消
            </ProductButton>
            <ProductButton
              variant="danger"
              disabled={busy}
              onClick={() => void withdraw()}
            >
              {busy ? '正在撤回…' : '确认停止查看'}
            </ProductButton>
          </>
        }
      >
        <p>
          确认后，本份报告的授权将被撤回。您与孩子的关联以及其他报告的授权仍然保留。
        </p>
        {withdrawError && (
          <ProductStatus kind="error" title="撤回未完成">
            {withdrawError}
          </ProductStatus>
        )}
      </ManagementDialog>
    </div>
  )
}
export default function ParentChildReportPage() {
  const { childId = '', artifactId = '' } = useParams(),
    { user } = useAuth()
  return (
    <ProductPage width="reading">
      <PageHeader
        title="孩子报告"
        actions={
          <Link to={`/parent/children/${encodeURIComponent(childId)}`}>
            返回报告列表
          </Link>
        }
      />
      <ParentFeature>
        <Content
          key={`${user?.id}:${childId}:${artifactId}`}
          childId={childId}
          artifactId={artifactId}
        />
      </ParentFeature>
    </ProductPage>
  )
}
