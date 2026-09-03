import React, { useEffect, useState } from 'react'
import {
  instrumentAuthorizationApi,
  type InstrumentAuthorizationRow,
} from '../../api/instrumentAuthorizations'

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
  const [preview, setPreview] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState(emptyForm)

  const reload = async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await instrumentAuthorizationApi.list()
      if (response.code !== 0) throw new Error(response.message || '加载失败')
      setList(response.data?.list || [])
    } catch (err) {
      setError((err as { message?: string }).message || '加载失败')
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
          territories: form.territories.split(/[,，\s]+/).map((row) => row.trim()).filter(Boolean),
          locales: form.locales.split(/[,，\s]+/).map((row) => row.trim()).filter(Boolean),
          commercialNature: form.commercialNature,
        },
        validFrom: form.validFrom,
        validTo: form.validTo,
        basis: form.basis.trim(),
      })
      if (response.code !== 0) throw new Error(response.message || '创建失败')
      setForm(emptyForm())
      await reload()
    } catch (err) {
      setError((err as { message?: string }).message || '创建失败')
    }
  }

  const approve = async (row: InstrumentAuthorizationRow) => {
    try {
      setError(null)
      const response = await instrumentAuthorizationApi.approve(row.authorizationId, declaration)
      if (response.code !== 0) throw new Error(response.message || '批准失败')
      setDeclaration('')
      await reload()
    } catch (err) {
      setError((err as { message?: string }).message || '批准失败')
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
    } catch (err) {
      setError((err as { message?: string }).message || '预览失败')
    }
  }

  const field = (label: string, key: keyof ReturnType<typeof emptyForm>, type: 'text' | 'checkbox' | 'select' = 'text') => {
    if (type === 'checkbox') {
      return (
        <label className="block text-sm text-gray-600 mb-2">
          <input
            className="mr-2"
            type="checkbox"
            checked={Boolean(form[key])}
            onChange={(e) => setForm({ ...form, [key]: e.target.checked })}
          />
          {label}
        </label>
      )
    }
    if (type === 'select' && key === 'commercialNature') {
      return (
        <label className="block text-sm text-gray-600 mb-2">
          {label}
          <select
            className="ml-2 border rounded px-2 py-1"
            value={String(form.commercialNature)}
            onChange={(e) => setForm({
              ...form,
              commercialNature: e.target.value as typeof form.commercialNature,
            })}
          >
            <option value="NON_COMMERCIAL">NON_COMMERCIAL</option>
            <option value="COMMERCIAL">COMMERCIAL</option>
            <option value="UNSPECIFIED">UNSPECIFIED</option>
          </select>
        </label>
      )
    }
    return (
      <label className="block text-sm text-gray-600 mb-2">
        {label}
        <input
          className="ml-2 border rounded px-3 py-2 w-full max-w-xl"
          value={String(form[key] ?? '')}
          onChange={(e) => setForm({ ...form, [key]: e.target.value })}
          placeholder={label}
        />
      </label>
    )
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-800 mb-4">测评内容授权</h1>
      <p className="text-sm text-gray-500 mb-4">
        授权记录与动态 Publish 校验（科学/权利/语言/报告/安全/golden）。同一管理员可自批，但必须填写确认声明。
        EXPIRED/REVOKED/SCOPE_MISMATCH 会将目录置 HOLD 并停止新建。表单默认空白，不预填任何法律事实。
      </p>
      {error && <p className="text-red-500 mb-4">{error}</p>}

      <div className="border rounded p-4 mb-4 bg-white space-y-1">
        <h2 className="font-semibold mb-2">新建授权草稿</h2>
        {field('Instrument key（非法律身份）', 'instrumentKey')}
        {field('Instrument version', 'instrumentVersion')}
        {field('授权方 grantor', 'grantor')}
        {field('被授权方 grantee', 'grantee')}
        {field('商业性质', 'commercialNature', 'select')}
        {field('地区 territories（逗号分隔）', 'territories')}
        {field('语言 locales（逗号分隔）', 'locales')}
        {field('有效期起 validFrom (UTC ISO)', 'validFrom')}
        {field('有效期止 validTo (UTC ISO)', 'validTo')}
        {field('依据 basis', 'basis')}
        {field('电子施测', 'electronicAdministration', 'checkbox')}
        {field('评分', 'scoring', 'checkbox')}
        {field('翻译', 'translation', 'checkbox')}
        {field('展示', 'display', 'checkbox')}
        <button className="btn-primary mt-2" onClick={() => void createDraft()}>创建授权草稿</button>
      </div>

      <div className="flex flex-wrap gap-2 mb-4">
        <button className="btn-secondary" onClick={() => void runPublishPreview()}>Publish 预览（WHO-5 Bundle）</button>
      </div>
      <label className="block text-sm text-gray-600 mb-4">
        自批确认声明
        <input
          className="ml-2 border rounded px-3 py-2 w-full max-w-xl"
          value={declaration}
          onChange={(e) => setDeclaration(e.target.value)}
          placeholder="同一管理员批准时必填"
        />
      </label>
      {preview && <p className="text-sm bg-gray-50 border rounded p-3 mb-4 whitespace-pre-wrap">{preview}</p>}
      {loading ? (
        <p>加载中…</p>
      ) : (
        <table className="min-w-full text-sm">
          <thead>
            <tr className="text-left border-b">
              <th className="py-2">Instrument</th>
              <th>Version</th>
              <th>Status</th>
              <th>Commercial</th>
              <th>Auth Ver</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {list.map((row) => (
              <tr key={`${row.authorizationId}@${row.version}`} className="border-b">
                <td className="py-2">{row.instrumentKey}</td>
                <td>{row.instrumentVersion}</td>
                <td>{row.status}</td>
                <td>{row.scope?.commercialNature}</td>
                <td>v{row.version}</td>
                <td>
                  {(row.status === 'DRAFT' || row.status === 'EVIDENCE_PENDING') && (
                    <button className="btn-secondary" onClick={() => void approve(row)}>批准</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

export default InstrumentAuthorizationPage
