import React, { useEffect, useState } from 'react'
import {
  instrumentAuthorizationApi,
  type InstrumentAuthorizationRow,
} from '../../api/instrumentAuthorizations'

/**
 * Admin “测评内容授权” + Publish gates UI.
 * Self-approve requires an explicit confirmation declaration.
 */
const InstrumentAuthorizationPage: React.FC = () => {
  const [list, setList] = useState<InstrumentAuthorizationRow[]>([])
  const [error, setError] = useState<string | null>(null)
  const [declaration, setDeclaration] = useState('')
  const [preview, setPreview] = useState<string>('')
  const [loading, setLoading] = useState(true)

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

  const createWho5Draft = async () => {
    try {
      setError(null)
      const response = await instrumentAuthorizationApi.create({
        instrumentKey: 'who5',
        instrumentVersion: '1.0.0',
        grantor: 'WHO',
        grantee: 'eduK12',
        scope: {
          electronicAdministration: true,
          scoring: true,
          translation: true,
          display: true,
          territories: ['CN'],
          locales: ['zh-CN'],
          commercialNature: 'NON_COMMERCIAL',
        },
        validFrom: '2026-01-01T00:00:00.000Z',
        validTo: '2027-01-01T00:00:00.000Z',
        basis: 'WHO-5 non-commercial research use',
      })
      if (response.code !== 0) throw new Error(response.message || '创建失败')
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
      })
      if (response.code !== 0) throw new Error(response.message || '预览失败')
      const data = response.data
      setPreview(
        `publishable=${data.publishable}; catalog=${data.catalogStatus}; allowNewStarts=${data.allowNewStarts}; `
        + `errors=${(data.errors || []).join(' | ') || 'none'}; `
        + `warnings=${(data.warnings || []).join(' | ') || 'none'}`,
      )
    } catch (err) {
      setError((err as { message?: string }).message || '预览失败')
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-800 mb-4">测评内容授权</h1>
      <p className="text-sm text-gray-500 mb-4">
        授权记录与动态 Publish 校验（科学/权利/语言/报告/安全/golden）。同一管理员可自批，但必须填写确认声明。
        WHO-5 仅 NON_COMMERCIAL 可发布；EXPIRED/REVOKED/SCOPE_MISMATCH 会将目录置 HOLD 并停止新建。
      </p>
      {error && <p className="text-red-500 mb-4">{error}</p>}
      <div className="flex flex-wrap gap-2 mb-4">
        <button className="btn-primary" onClick={() => void createWho5Draft()}>创建 WHO-5 授权草稿</button>
        <button className="btn-secondary" onClick={() => void runPublishPreview()}>Publish 预览（WHO-5）</button>
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
      {preview && <p className="text-sm bg-gray-50 border rounded p-3 mb-4">{preview}</p>}
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
