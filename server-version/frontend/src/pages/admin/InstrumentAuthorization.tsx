import TrainingResourceActions from '../../training/TrainingResourceActions'
import React, { useEffect, useState, useRef } from 'react'
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

const InstrumentAuthorizationPage: React.FC<{training?:boolean}> = ({training=false}) => {
  const [showDraft,setShowDraft]=useState(!training)
  const [keyword,setKeyword]=useState('')
  const [busy,setBusy]=useState(false)
  const pending=useRef(false)
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
    if(pending.current)return
    pending.current=true;setBusy(true)
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
    } finally {pending.current=false;setBusy(false)}
  }

  const approve = async (row: InstrumentAuthorizationRow) => {
    if(pending.current)return
    pending.current=true;setBusy(true)
    try {
      setError(null)
      const response = await instrumentAuthorizationApi.approve(row.authorizationId, declaration)
      if (response.code !== 0) throw new Error(response.message || '批准失败')
      setDeclaration('')
      await reload()
    } catch (operationError) {
      setError((operationError as { message?: string }).message || '批准失败')
    } finally {pending.current=false;setBusy(false)}
  }

  const runPublishPreview = async () => {
    if(pending.current)return
    pending.current=true;setBusy(true)
    try {
      setError(null)
      if (!form.instrumentKey.trim() || !form.instrumentVersion.trim()) throw new Error('请先填写 instrumentKey 与 instrumentVersion')
      const response = await instrumentAuthorizationApi.publishPreviewScale({
        instrumentKey: form.instrumentKey.trim(),
        instrumentVersion: form.instrumentVersion.trim(),
        locale: form.locales.split(/[,，\s]+/).map(row => row.trim()).filter(Boolean)[0] ?? '',
        territory: form.territories.split(/[,，\s]+/).map(row => row.trim()).filter(Boolean)[0] ?? '',
        commercialNature: form.commercialNature === 'COMMERCIAL' ? 'COMMERCIAL' : 'NON_COMMERCIAL',
        deploymentModes: ['STANDALONE'],
      })
      if (response.code !== 0) throw new Error(response.message || '预览失败')
      const data = response.data
      const decisions = (data.admission?.decisions || []).map((decision: { requestedMode: string; allowNewStarts: boolean; reasons: string[] }) =>
        `${decision.requestedMode}:${decision.allowNewStarts ? 'allow' : 'deny'}[${(decision.reasons || []).join(',')}]`
      ).join(' | ')
      setPreview(
        `identity=${data.identity?.instrumentKey}@${data.identity?.instrumentVersion}; `
        + `allowActivation=${data.allowActivation}; decisions=${decisions || 'none'}; `
        + `blockers=${(data.blockers || []).join(' | ') || 'none'}`,
      )
    } catch (operationError) {
      setError((operationError as { message?: string }).message || '预览失败')
    } finally {pending.current=false;setBusy(false)}
  }

  const textField = (label: string, key: keyof ReturnType<typeof emptyForm>) => (
    <label className="block text-sm text-gray-700">
      <span className="mb-1 block font-medium">{label}</span>
      <input
        className="input w-full"
        disabled={busy}
        value={String(form[key] ?? '')}
        onChange={event => setForm({ ...form, [key]: event.target.value })}
        placeholder={label}
      />
    </label>
  )

  const publishControls=(<>        <div className="flex flex-wrap items-center justify-between gap-3">

          <button type="button" className="hui-button hui-button--secondary" disabled={busy} onClick={() => void runPublishPreview()}>{training?'预览发布条件':'Scale Publish 预览'}</button>
        </div>

        {!training&&<label className="block max-w-2xl text-sm text-gray-700">
          <span className="mb-1 block font-medium">自批确认声明</span>
          <input
            className="input w-full"
            disabled={busy}
            value={declaration}
            onChange={event => setDeclaration(event.target.value)}
            placeholder="同一管理员批准时必填"
          />
        </label>}

        {preview && (
          <pre className="overflow-x-auto whitespace-pre-wrap rounded border bg-gray-50 p-3 text-sm" aria-label="Publish gate 预览结果">{preview}</pre>
        )}</>)

  return (
    <ProductPage width="management" className={training?"training-inline-rights space-y-6":"space-y-6"}>
      <PageHeader
        title={training?"内容权利授权":"测评内容授权"}
        headingLevel={training?2:1}
        description={training?undefined:"授权记录与动态 Publish 校验（科学/权利/语言/报告/安全/golden）。同一管理员可自批，但必须填写确认声明。EXPIRED/REVOKED/SCOPE_MISMATCH 会将目录置 HOLD 并停止新建。表单默认空白，不预填任何法律事实。"}
      />

      {error && (
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-700">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span>{error}</span>
            <button type="button" className="hui-button hui-button--secondary" onClick={() => void reload()}>重新加载列表</button>
          </div>
        </div>
      )}

      {training&&<button type="button" className="training-accounts-secondary" disabled={busy} aria-expanded={showDraft} onClick={()=>setShowDraft(value=>!value)}>{showDraft?'收起草稿表单':'新建授权草稿'}</button>}
      {showDraft&&<section className="staff-panel staff-panel--padded space-y-4" aria-labelledby="authorization-draft-title">
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
              disabled={busy}
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
                  disabled={busy}
                  checked={Boolean(form[key])}
                  onChange={event => setForm({ ...form, [key]: event.target.checked })}
                />
                {label}
              </label>
            ))}
          </div>
        </fieldset>

        <button type="button" className="hui-button hui-button--primary" disabled={busy} onClick={() => void createDraft()}>创建授权草稿</button>
      </section>}

      <section className="staff-panel staff-panel--padded space-y-4" aria-labelledby="authorization-gates-title">
        {training&&<details className="training-resource-search"><summary>权利检索<span>{keyword?"关键词："+keyword:"按标识、版本或状态查找"}</span></summary><label className="training-rights-search">搜索权利记录<input type="search" value={keyword} disabled={busy} onChange={event=>setKeyword(event.target.value)} placeholder="测评标识、版本或状态"/></label>{keyword&&<button type="button" disabled={busy} className="training-accounts-secondary" onClick={()=>setKeyword('')}>清除筛选</button>}</details>}
        <h2 id="authorization-gates-title" className="text-lg font-semibold">{training?'内容权利记录':'Publish gate 预览与批准'}</h2>
        {training?<TrainingResourceActions label="发布条件预览">{publishControls}</TrainingResourceActions>:publishControls}

        {loading ? (
          <p role="status" aria-live="polite">加载中…</p>
        ) : list.length === 0 ? (
          <div className="rounded-lg border border-dashed p-8 text-center text-gray-500">暂无授权记录。</div>
        ) : (
          <div className={training?"training-resource-list-wrap":"overflow-x-auto"}>
            <table className={training?"min-w-full text-sm training-resource-record-table":"min-w-full text-sm"}>
              <thead>
                <tr className="border-b text-left">
                  <th className="py-2 pr-4">{training?'测评标识':'Instrument'}</th>
                  <th className="pr-4">{training?'内容版本':'Version'}</th>
                  <th className="pr-4">{training?'状态':'Status'}</th>
                  <th className="pr-4">{training?'商业性质':'Commercial'}</th>
                  <th className="pr-4">{training?'授权版本':'Auth Ver'}</th>
                  <th className="text-right">操作</th>
                </tr>
              </thead>
              <tbody>
                {list.filter(row=>!training||[row.instrumentKey,row.instrumentVersion,row.status].some(value=>String(value||'').toLocaleLowerCase().includes(keyword.toLocaleLowerCase()))).map(row => (
                  <tr key={`${row.authorizationId}@${row.version}`} className="border-b">
                    <td data-label="测评标识" className="py-3 pr-4">{row.instrumentKey}</td>
                    <td data-label="内容版本" className="pr-4">{row.instrumentVersion}</td>
                    <td data-label="状态" className="pr-4">{row.status}</td>
                    <td data-label="商业性质" className="pr-4">{row.scope?.commercialNature}</td>
                    <td data-label="授权版本" className="pr-4">v{row.version}</td>
                    <td data-label="管理操作" className="py-2 text-right training-resource-action-cell">
                      {training&&(row.status==='DRAFT'||row.status==='EVIDENCE_PENDING')?<TrainingResourceActions label="批准管理"><label className="training-rights-declaration">自批确认声明<input className="input w-full" value={declaration} disabled={busy} onChange={event=>setDeclaration(event.target.value)} placeholder="同一管理员批准时必填"/></label><button type="button" className="hui-button hui-button--secondary" disabled={busy} onClick={()=>void approve(row)} aria-label={`批准 ${row.instrumentKey} ${row.instrumentVersion} 授权版本 ${row.version}`}>批准</button></TrainingResourceActions>:!training&&(row.status === 'DRAFT' || row.status === 'EVIDENCE_PENDING') && (
                        <button
                          type="button"
                          className="hui-button hui-button--secondary"
                          disabled={busy} onClick={() => void approve(row)}
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
