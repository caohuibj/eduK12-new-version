import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import {
  parentsApi,
  type GrantOption,
  type PublicationPreview,
  type Projection,
} from '../../api/parents'
import { useAuth } from '../../contexts/AuthContext'
import { useOrganization } from '../../contexts/OrganizationContext'
import {
  PageHeader,
  ProductButton,
  ProductPage,
  ProductStatus,
} from '../../components/product-ui'
import ParentFeature from './ParentFeature'
import ParentReportView from './ParentReportView'
import ParentBatchPreparation from './ParentBatchPreparation'
import { parentError, useParentResource } from './useParentResource'
function Actions({ artifactId }: { artifactId: string }) {
  const load = useCallback(
      (signal: AbortSignal) => parentsApi.templates(artifactId, signal),
      [artifactId],
    ),
    { data, error, loading, reload } = useParentResource(
      `publication-templates:${artifactId}`,
      load,
    )
  const [template, setTemplate] = useState(''),
    [preview, setPreview] = useState<PublicationPreview | null>(null),
    [consents, setConsents] = useState<{
      projection: Projection
      list: GrantOption[]
      truncated: boolean
    } | null>(null),
    [busy, setBusy] = useState(false),
    [failure, setFailure] = useState(''),
    [notice, setNotice] = useState(''),
    lock = useRef(false),
    epoch = useRef(0)
  useEffect(() => {
    const clear = () => {
      epoch.current++
      setPreview(null)
      setConsents(null)
    }
    window.addEventListener('focus', clear)
    return () => {
      epoch.current++
      window.removeEventListener('focus', clear)
    }
  }, [])
  const act = async (action: (current: () => boolean) => Promise<void>) => {
    if (lock.current) return
    lock.current = true
    setBusy(true)
    setFailure('')
    setNotice('')
    const at = epoch.current
    try {
      await action(() => epoch.current === at)
    } catch (e) {
      if (epoch.current === at) {
        setFailure(parentError(e, '操作未确认，请重新预览核对'))
        setPreview(null)
        setConsents(null)
      }
    } finally {
      lock.current = false
      setBusy(false)
    }
  }
  return (
    <section
      className="rounded-xl border border-slate-200 bg-white p-4 space-y-4"
      aria-label="报告发布与授权"
    >
      {failure && (
        <ProductStatus kind="error" title="操作未确认">
          {failure}
        </ProductStatus>
      )}
      {notice && (
        <ProductStatus kind="success" title="操作完成">
          {notice}
        </ProductStatus>
      )}
      {loading ? (
        <ProductStatus kind="pending" title="正在核对可发布模板">
          请稍候。
        </ProductStatus>
      ) : error ? (
        <ProductStatus
          kind="error"
          title="模板加载失败"
          actions={<ProductButton onClick={reload}>重试</ProductButton>}
        >
          {error}
        </ProductStatus>
      ) : (
        <>
          <label className="block">
            家长报告模板
            <select
              className="input mt-1"
              value={template}
              disabled={busy}
              onChange={(e) => {
                setTemplate(e.target.value)
                setPreview(null)
                setConsents(null)
              }}
            >
              <option value="">选择模板</option>
              {data?.list.map((row) => (
                <option
                  key={`${row.key}:${row.version}`}
                  value={`${row.key}:${row.version}`}
                >
                  {row.title} · {row.version}
                </option>
              ))}
            </select>
          </label>
          {!data?.list.length && (
            <p>当前没有可发布的模板，请核对工具披露设置和正式模板配置。</p>
          )}
          <ProductButton
            disabled={busy || !template}
            onClick={() =>
              void act(async (current) => {
                const [key, version] = template.split(':')
                const result = await parentsApi.previewPublication(
                  artifactId,
                  key,
                  version,
                )
                if (current()) {
                  setPreview(result)
                  setConsents(null)
                }
              })
            }
          >
            生成家长报告预览
          </ProductButton>
        </>
      )}
      {preview && (
        <>
          <ParentReportView report={preview.projection} />
          <p>发布后，学生仍需同意这份具体内容，再由有权负责人逐份授权。</p>
          <ProductButton
            variant="primary"
            disabled={busy || !preview.allowedActions.includes('PUBLISH')}
            onClick={() =>
              void act(async (current) => {
                await parentsApi.publish(preview)
                if (current()) {
                  setPreview(null)
                  setNotice('家长报告已发布，请等待学生逐份同意后授权')
                }
              })
            }
          >
            确认发布此版本
          </ProductButton>
        </>
      )}
      <ProductButton
        disabled={busy}
        onClick={() =>
          void act(async (current) => {
            const rows = await parentsApi.consents(artifactId)
            if (current()) {
              setConsents(rows)
              setPreview(null)
            }
          })
        }
      >
        查看学生同意与授权
      </ProductButton>
      {consents && (
        <div className="space-y-4">
          <ParentReportView report={consents.projection} />
          {!consents.list.length && (
            <p>
              暂无当前有效的学生同意。请学生到“家长关联 →
              管理报告授权”核对这份报告。
            </p>
          )}
          {consents.list.map((row) => (
            <div
              key={row.id}
              className="flex flex-wrap items-center gap-3 border-t border-slate-200 pt-3"
            >
              <span>接收家长：{row.parentName}</span>
              <ProductButton
                disabled={busy || !row.allowedActions.includes('GRANT')}
                variant="primary"
                onClick={() =>
                  void act(async (current) => {
                    await parentsApi.grant(artifactId, row)
                    if (current())
                      setNotice(`已为 ${row.parentName} 授权本份报告`)
                  })
                }
              >
                授权给 {row.parentName}
              </ProductButton>
            </div>
          ))}
          {consents.truncated && <p>当前同意较多，请联系平台核对更多记录。</p>}
        </div>
      )}
    </section>
  )
}
function Content({ organizationId }: { organizationId: string }) {
  const [page, setPage] = useState(1),
    [selected, setSelected] = useState(''),
    load = useCallback(
      (signal: AbortSignal) =>
        parentsApi.publications(organizationId, page, signal),
      [organizationId, page],
    )
  const { data, error, loading, reload } = useParentResource(
    `publications:${organizationId}:${page}`,
    load,
  )
  return (
    <div className="space-y-5">
      {loading ? (
        <ProductStatus kind="pending" title="正在加载可处理报告">
          请稍候。
        </ProductStatus>
      ) : error ? (
        <ProductStatus
          kind="error"
          title="报告列表不可用"
          actions={<ProductButton onClick={reload}>重试</ProductButton>}
        >
          {error}
        </ProductStatus>
      ) : (
        <>
          {!data?.list.length && (
            <ProductStatus kind="info" title="暂无可处理报告">
              需要先生成您有权读取且支持家长发布的组织报告。
            </ProductStatus>
          )}
          {data?.list.map((row) => (
            <div
              key={row.id}
              className="rounded-xl border border-slate-200 bg-white p-4 flex flex-wrap justify-between gap-3"
            >
              <span>
                {row.title} · {new Date(row.generatedAt).toLocaleString()}
              </span>
              <ProductButton onClick={() => setSelected(row.id)}>
                处理这份报告
              </ProductButton>
            </div>
          ))}
          <div className="flex gap-3">
            <ProductButton
              disabled={page === 1}
              onClick={() => {
                setSelected('')
                setPage((p) => p - 1)
              }}
            >
              上一页
            </ProductButton>
            <span>第 {page} 页</span>
            <ProductButton
              disabled={!data?.hasMore}
              onClick={() => {
                setSelected('')
                setPage((p) => p + 1)
              }}
            >
              下一页
            </ProductButton>
          </div>
          {selected && <Actions key={selected} artifactId={selected} />}
          {data?.list.length ? <ParentBatchPreparation key={`${organizationId}:${page}`} scope={`${organizationId}:${page}`} rows={data.list} /> : null}
        </>
      )}
    </div>
  )
}
export default function ParentPublicationPage() {
  const { organizationId = '' } = useParams(),
    { user } = useAuth(),
    { active } = useOrganization(),
    allowed =
      active?.organization.id === organizationId &&
      active.allowedActions.includes('PARENT_REPORT_PUBLICATION')
  return (
    <ProductPage width="management">
      <PageHeader
        title="家长报告发布与授权"
        description="发布家长专用内容，并处理学生已同意的具体报告。"
      />
      <ParentFeature>
        {allowed ? (
          <Content
            key={`${user?.id}:${organizationId}`}
            organizationId={organizationId}
          />
        ) : (
          <ProductStatus kind="warning" title="当前没有家长报告披露权限">
            需要有效组织成员关系、明确的家长报告披露能力，以及对具体来源的读取权限。
          </ProductStatus>
        )}
      </ParentFeature>
    </ProductPage>
  )
}
