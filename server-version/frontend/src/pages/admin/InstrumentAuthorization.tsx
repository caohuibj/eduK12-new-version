import React, { useEffect, useState } from 'react'
import {
  instrumentAuthorizationApi,
  type InstrumentAuthorizationRow,
} from '../../api/instrumentAuthorizations'
import { PageHeader } from '../../components/product-ui/PageHeader'
import { ProductPage } from '../../components/product-ui/ProductPage'

/**
 * Admin “测评内容授权” + Publish gates UI.
 * Self-approve requires an explicit confirmation declaration.
 * Form starts empty — no hard-coded WHO-5 legal facts (grantor/grantee/dates/scopes/basis).
 */
const emptyForm = () => ({
  instrumentKey: '',
  instrumentVersion: '',
  grantor: '',
  grantee: '',
  electronicAdministration: true,
  scoring: true,
  translation: false,
  display: true,
  territories: 'CN',
  locales: 'zh-CN',
  commercialNature: 'NON_COMMERCIAL' as 'NON_COMMERCIAL' | 'COMMERCIAL' | 'UNSPECIFIED',
  validFrom: '',
  validTo: '',
  basis: '',
})

const InstrumentAuthorizationPage: React.FC = () => {
  const [list, setList] = useState<InstrumentAuthorizationRow[]>([])
  const [error, setError] = useState<string | null>(null)
  const [declaration, setDeclaration] = useState('')
  const [preview, setPreview] = useState('')
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState(emptyForm)

  const reload = async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await instrumentAuthorizationApi.list()
      if (response.code !== 0) throw new Error(response.message || '加载失败')
      setList(response.data?.list || [])
    } catch (loadError) {
      setError((loadError as { message?: string }).message || '加载失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void reload()
  }, [])

  const createDraft = async () => {
    try {
      setError(null)
      if (!form.instrumentKey.trim() || !form.instrumentVersion.trim()) {
        throw new Error('请填写 instrumentKey 与 instrumentVersion（非法律身份字段）')
      }
      if (!form.grantor.trim() || !form.grantee.trim() || !form.basis.trim()) {
        throw new Error('请填写授权方、被授权方与依据')
      }
      if (!form.validFrom || !form.validTo) {
        throw new Error('请填写有效期')
      }
      const response = await instrumentAuthorizationApi.create({
        instrumentKey: form.instrumentKey.trim(),
        instrumentVersion: form.instrumentVersion.trim(),
        grantor: form.grantor.trim(),
        grantee: form.grantee.trim(),
        scope: {
          electronicAdministration: form.electronicAdministration,
          scoring: form.scoring,
          translation: form.translation,
          display: form.display,
          territories: form.territories.split(/[,，\s]+/).map(row => row.trim()).filter(Boolean),
          locales: form.locales.split(/[,，\s]+/).map(row => row.trim()).filter(Boolean),
          commercialNature: form.commercialNature,
        },
        validFrom: form.validFrom,
        validTo: form.validTo,
        basis: form.basis.trim(),
      })
      if (response.code !== 0) throw new Error(response.message || '创建失败')
      setForm(emptyForm())
      await reload()
    } catch (operationError) {
      setError((operationError as { message?: string }).message || '创建失败')
    }
  }

  const approve = async (row: InstrumentAuthorizationRow) => {
    try {
      setError(null)
      const response = await instrumentAuthorizationApi.approve(row.authorizationId, declaration)
      if (response.code !== 0) throw new Error(response.message || '批准失败')
      setDeclaration('')
      await reload()
    } catch (operationError) {
      setError((operationError as { message?: string }).message || '批准失败')
    }
  }

  const runPublishPreview = async () => {
    try {
      setError(null)
      const response = await instrumentAuthorizationApi.publishPreviewWho5({
        locale: 'zh-CN',
        territory: 'CN',
        deploymentCommercialNature: 'NON_COMMERCIAL',
        // Preview without proofs must show pending — never fake pass.
      })
      if (response.code !== 0) throw new Error(response.message || '预览失败')
      const data = response.data
      const gateSummary = (data.gates || [])
        .map((gate: { gate: string; evaluation?: string; ok: boolean }) => (
          `${gate.gate}:${gate.evaluation ?? (gate.ok ? 'ok' : 'fail')}`
        ))
        .join(', ')
      setPreview(
        `publishable=${data.publishable}; catalog=${data.catalogStatus}; allowNewStarts=${data.allowNewStarts}; `
        + `gates=[${gateSummary}]; `
        + `errors=${(data.errors || []).join(' | ') || 'none'}; `
        + `warnings=${(data.warnings || []).join(' | ') || 'none'}`,
      )
    } catch (operationError) {
      setError((operationError as { message?: string }).message || '预览失败')
    }
  }

  const textField = (label: string, key: keyof ReturnType<typeof emptyForm>) => (
    <label className="block text-sm text-gray-700">
      <span className="mb-1 block font-medium">{label}</span>
      <input
        className="input w-full"
        value={String(form[key] ?? '')}
        onChange={event => setForm({ ...form, [key]: event.target.value })}
        placeholder={label}
      />
    </label>
  )

  return (
    <ProductPage width="management" className="space-y-6">
      <PageHeader
        title="测评内容授权"
        description="授权记录与动态 Publish 校验（科学/权利/语言/报告/安全/golden）。同一管理员可自批，但必须填写确认声明。EXPIRED/REVOKED/SCOPE_MISMATCH 会将目录置 HOLD 并停止新建。表单默认空白，不预填任何法律事实。"
      />

      {error && (
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-700">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span>{error}</span>
            <button type="button" className="btn-secondary" onClick={() => void reload()}>重新加载列表</button>
          </div>
        </div>
      )}

      <section className="card space-y-4" aria-labelledby="authorization-draft-title">
        <h2 id="authorization-draft-title" className="text-lg font-semibold">新建授权草稿</h2>
        <div className="grid gap-4 md:grid-cols-2">
          {textField('Instrument key（非法律身份）', 'instrumentKey')}
          {textField('Instrument version', 'instrumentVersion')}
          {textField('授权方 grantor', 'grantor')}
          {textField('被授权方 grantee', 'grantee')}
          <label className="block text-sm text-gray-700">
            <span className="mb-1 block font-medium">商业性质</span>
            <select
              className="input w-full"
              value={form.commercialNature}
              onChange={event => setForm({ ...form, commercialNature: event.target.value as typeof form.commercialNature })}
            >
              <option value="NON_COMMERCIAL">NON_COMMERCIAL</option>
              <option value="COMMERCIAL">COMMERCIAL</option>
              <option value="UNSPECIFIED">UNSPECIFIED</option>
            </select>
          </label>
          {textField('地区 territories（逗号分隔）', 'territories')}
          {textField('语言 locales（逗号分隔）', 'locales')}
          {textField('有效期起 validFrom (UTC ISO)', 'validFrom')}
          {textField('有效期止 validTo (UTC ISO)', 'validTo')}
          <div className="md:col-span-2">{textField('依据 basis', 'basis')}</div>
        </div>

        <fieldset className="rounded-lg border p-4">
          <legend className="px-1 text-sm font-medium text-gray-700">授权范围</legend>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {([
              ['电子施测', 'electronicAdministration'],
              ['评分', 'scoring'],
              ['翻译', 'translation'],
              ['展示', 'display'],
            ] as const).map(([label, key]) => (
              <label key={key} className="flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={Boolean(form[key])}
                  onChange={event => setForm({ ...form, [key]: event.target.checked })}
                />
                {label}
              </label>
            ))}
          </div>
        </fieldset>

        <button type="button" className="btn-primary" onClick={() => void createDraft()}>创建授权草稿</button>
      </section>

      <section className="card space-y-4" aria-labelledby="authorization-gates-title">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="authorization-gates-title" className="text-lg font-semibold">Publish gate 预览与批准</h2>
          <button type="button" className="btn-secondary" onClick={() => void runPublishPreview()}>Publish 预览（WHO-5 Bundle）</button>
        </div>

        <label className="block max-w-2xl text-sm text-gray-700">
          <span className="mb-1 block font-medium">自批确认声明</span>
          <input
            className="input w-full"
            value={declaration}
            onChange={event => setDeclaration(event.target.value)}
            placeholder="同一管理员批准时必填"
          />
        </label>

        {preview && (
          <pre className="overflow-x-auto whitespace-pre-wrap rounded border bg-gray-50 p-3 text-sm" aria-label="Publish gate 预览结果">{preview}</pre>
        )}

        {loading ? (
          <p role="status" aria-live="polite">加载中…</p>
        ) : list.length === 0 ? (
          <div className="rounded-lg border border-dashed p-8 text-center text-gray-500">暂无授权记录。</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b text-left">
                  <th className="py-2 pr-4">Instrument</th>
                  <th className="pr-4">Version</th>
                  <th className="pr-4">Status</th>
                  <th className="pr-4">Commercial</th>
                  <th className="pr-4">Auth Ver</th>
                  <th className="text-right">操作</th>
                </tr>
              </thead>
              <tbody>
                {list.map(row => (
                  <tr key={`${row.authorizationId}@${row.version}`} className="border-b">
                    <td className="py-3 pr-4">{row.instrumentKey}</td>
                    <td className="pr-4">{row.instrumentVersion}</td>
                    <td className="pr-4">{row.status}</td>
                    <td className="pr-4">{row.scope?.commercialNature}</td>
                    <td className="pr-4">v{row.version}</td>
                    <td className="py-2 text-right">
                      {(row.status === 'DRAFT' || row.status === 'EVIDENCE_PENDING') && (
                        <button
                          type="button"
                          className="btn-secondary"
                          onClick={() => void approve(row)}
                          aria-label={`批准 ${row.instrumentKey} ${row.instrumentVersion} 授权版本 ${row.version}`}
                        >
                          批准
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </ProductPage>
  )
}

export default InstrumentAuthorizationPage