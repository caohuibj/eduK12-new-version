import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  parentToolPoliciesApi,
  type ToolRef,
  type ToolPolicy,
  type PolicySnapshot,
} from '../../api/parentToolPolicies'
import { useAuth } from '../../contexts/AuthContext'
import { useOrganization } from '../../contexts/OrganizationContext'
import {
  PageHeader,
  ProductButton,
  ProductPage,
  ProductStatus,
} from '../../components/product-ui'
import {
  useSessionResource,
  resourceError,
} from '../../hooks/useSessionResource'
const names: Record<ToolRef['family'], string> = {
  SCALE: '量表',
  FORM: '问卷',
  BUNDLE: '综合测评',
  COGNITIVE: '认知测评',
  SITUATIONAL: '情境测评',
}
function Editor({
  snapshot,
  onChanged,
}: {
  snapshot: PolicySnapshot
  onChanged: () => void
}) {
  const [mode, setMode] = useState<ToolPolicy['mode']>(snapshot.policy.mode),
    [metrics, setMetrics] = useState(snapshot.policy.metricKeys.join('\n')),
    [longitudinal, setLongitudinal] = useState(
      snapshot.policy.longitudinalMetricKeys.join('\n'),
    ),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    lock = useRef(false)
  const keys = (text: string) => [
    ...new Set(
      text
        .split(/[\n,，]/)
        .map((v) => v.trim())
        .filter(Boolean),
    ),
  ]
  return (
    <form
      className="rounded-xl border border-slate-200 bg-white p-4 space-y-4"
      onSubmit={async (e) => {
        e.preventDefault()
        if (lock.current) return
        const policy: ToolPolicy = {
          mode,
          metricKeys: mode === 'INDIVIDUAL_SUMMARY' ? keys(metrics) : [],
          longitudinalMetricKeys:
            mode === 'INDIVIDUAL_SUMMARY' ? keys(longitudinal) : [],
        }
        if (
          policy.longitudinalMetricKeys.some(
            (k) => !policy.metricKeys.includes(k),
          )
        ) {
          setError('纵向指标必须包含在个人摘要指标范围内')
          return
        }
        if (
          !window.confirm(
            `确认修改 ${snapshot.tool.key} / ${snapshot.tool.version} 的家长披露设置？收紧设置会立即停止超出范围的报告访问。`,
          )
        )
          return
        lock.current = true
        setBusy(true)
        setError('')
        try {
          await parentToolPoliciesApi.save(snapshot, policy)
          setNotice('设置已保存')
          onChanged()
        } catch (err) {
          setError(resourceError(err, '设置未确认，请重新读取核对'))
          onChanged()
        } finally {
          lock.current = false
          setBusy(false)
        }
      }}
    >
      <h2 className="font-semibold">
        {names[snapshot.tool.family]}：{snapshot.tool.key} /{' '}
        {snapshot.tool.version}
      </h2>
      <p>当前设置版本：{snapshot.version}</p>
      {error && (
        <ProductStatus kind="error" title="设置未完成">
          {error}
        </ProductStatus>
      )}
      {notice && <p role="status">{notice}</p>}
      <label className="block">
        允许披露的上限
        <select
          className="input mt-1"
          value={mode}
          disabled={busy}
          onChange={(e) => setMode(e.target.value as ToolPolicy['mode'])}
        >
          <option value="NONE">不披露</option>
          <option value="COMPLETION_ONLY">仅完成情况</option>
          <option value="INDIVIDUAL_SUMMARY">已审核的个人摘要指标</option>
        </select>
      </label>
      {mode === 'INDIVIDUAL_SUMMARY' && (
        <>
          <label className="block">
            个人摘要指标键
            <textarea
              className="input mt-1"
              value={metrics}
              disabled={busy}
              onChange={(e) => setMetrics(e.target.value)}
              maxLength={10000}
            />
          </label>
          <label className="block">
            纵向指标键
            <textarea
              className="input mt-1"
              value={longitudinal}
              disabled={busy}
              onChange={(e) => setLongitudinal(e.target.value)}
              maxLength={10000}
            />
          </label>
          <p>
            每行一个正式指标键。需已有对应版本的审核模板、报告来源和披露合同；此设置不会生成解读文案。
          </p>
        </>
      )}
      <ProductButton
        type="submit"
        variant="primary"
        disabled={busy || !snapshot.allowedActions.includes('UPDATE')}
      >
        确认保存工具披露设置
      </ProductButton>
    </form>
  )
}
function Content() {
  const [family, setFamily] = useState<ToolRef['family']>('SCALE'),
    [key, setKey] = useState(''),
    [version, setVersion] = useState(''),
    [ref, setRef] = useState<ToolRef | null>(null)
  const load = useCallback(
      (signal: AbortSignal) =>
        ref ? parentToolPoliciesApi.read(ref, signal) : Promise.resolve(null),
      [ref],
    ),
    { data, error, loading, reload } = useSessionResource(
      'parent-tool-policy:' + JSON.stringify(ref),
      load,
    )
  useEffect(() => {
    const clear = () => setRef(null)
    window.addEventListener('focus', clear)
    return () => window.removeEventListener('focus', clear)
  }, [])
  return (
    <div className="space-y-5">
      <p>
        按正式工具家族、资源键和精确版本配置。新工具默认不披露，不会继承另一个版本的设置。
      </p>
      <form
        className="grid gap-3"
        onSubmit={(e) => {
          e.preventDefault()
          setRef({ family, key: key.trim(), version: version.trim() })
        }}
      >
        <label>
          工具家族
          <select
            className="input mt-1"
            value={family}
            onChange={(e) => {
              setFamily(e.target.value as ToolRef['family'])
              setRef(null)
            }}
          >
            {Object.entries(names).map(([value, name]) => (
              <option key={value} value={value}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <label>
          正式资源键
          <input
            className="input mt-1"
            value={key}
            onChange={(e) => {
              setKey(e.target.value)
              setRef(null)
            }}
            maxLength={128}
            required
          />
        </label>
        <label>
          精确工具版本
          <input
            className="input mt-1"
            value={version}
            onChange={(e) => {
              setVersion(e.target.value)
              setRef(null)
            }}
            maxLength={128}
            required
          />
        </label>
        <ProductButton type="submit">读取披露设置</ProductButton>
      </form>
      {ref && loading && <p role="status">正在读取设置…</p>}
      {error && (
        <ProductStatus
          kind="error"
          title="设置读取失败"
          actions={<ProductButton onClick={reload}>重新读取</ProductButton>}
        >
          {error}
        </ProductStatus>
      )}
      {data && (
        <Editor
          key={JSON.stringify(data.tool) + ':' + data.commandKey}
          snapshot={data}
          onChanged={reload}
        />
      )}
    </div>
  )
}
export default function ParentToolPoliciesPage() {
  const { user } = useAuth(),
    { platformRole } = useOrganization()
  return (
    <ProductPage width="reading">
      <PageHeader
        title="家长工具披露设置"
        description="平台管理员为每个正式工具版本配置披露上限。"
        actions={<Link to="/parent-accounts">家长账号管理</Link>}
      />
      {(platformRole ?? user?.platformRole) === 'SYSTEM_ADMIN' ? (
        <Content key={user?.id} />
      ) : (
        <ProductStatus kind="warning" title="需要平台管理员权限">
          组织角色和旧版管理员身份不能修改工具披露上限。
        </ProductStatus>
      )}
    </ProductPage>
  )
}
