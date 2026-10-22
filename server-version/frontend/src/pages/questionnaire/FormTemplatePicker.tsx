import { useEffect, useState } from 'react'
import apiClient from '../../api/client'
import AssessmentToolPicker from '../../components/AssessmentToolPicker'
import { ProductButton } from '../../components/product-ui'
import { apiErrorMessage } from '../../utils/apiErrorMessage'

export type FormTemplateSource = { id: string; kind: 'COMPOSITE' | 'LEGACY'; revision?: number }
type Choice = FormTemplateSource & { name: string; description?: string }

export function FormTemplatePicker({ disabled, onImport, excludeId }: { disabled: boolean; excludeId?: string; onImport: (source: FormTemplateSource) => void }) {
  const [rows, setRows] = useState<Choice[]>([])
  const [selected, setSelected] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [retry, setRetry] = useState(0)
  useEffect(() => {
    let active = true
    setLoading(true); setError(''); setRows([]); setSelected('')
    void apiClient.get<{ list: Choice[] }>('/questionnaire-products/form-templates').then(response => {
      if (response.code !== 0) throw new Error(response.message)
      if (!Array.isArray(response.data?.list)) throw new Error('可用表单目录格式无效，请重新读取')
      if (active) setRows(response.data.list)
    }).catch(cause => { if (active) setError(apiErrorMessage(cause)) }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [retry])
  const available = rows.filter(row => row.kind !== 'COMPOSITE' || row.id !== excludeId)
  const choice = available.find(row => `${row.kind}:${row.id}` === selected)
  return <section className="qt-form-template-picker" aria-label="从工具选用表单">
    <h3>从工具选用表单</h3><p>整份加入已保存的题目与区段。新问卷使用独立副本，后续修改互不影响，不带入投放时间或已有作答。</p>
    {loading ? <p role="status">正在读取可用表单…</p> : error ? <p role="alert">{error}<ProductButton onClick={() => setRetry(value => value + 1)}>重新读取</ProductButton></p> : <>
      <AssessmentToolPicker label="已有表单" options={available.map(row => ({ ...row, id: `${row.kind}:${row.id}`, version: row.revision == null ? null : `修订 ${row.revision}` }))} value={selected} onChange={setSelected} disabled={disabled || !available.length}/>
      <ProductButton disabled={disabled || !choice} onClick={() => { if (choice) onImport({ id: choice.id, kind: choice.kind, ...(choice.revision == null ? {} : { revision: choice.revision }) }) }}>整份加入当前问卷</ProductButton>
      {!available.length && <p>暂无可用表单。可先在“工具 → 表单”编制并保存。</p>}
    </>}
  </section>
}
