import { useState, type FormEvent } from 'react'
import { ProductButton, ProductPage } from '../../components/product-ui'

export type ScaleContextKey = 'birthYearMonth' | 'gradeLevel' | 'sexAtBirth' | 'primaryLanguage' | 'countryOrRegion'
const labels: Record<ScaleContextKey, string> = {
  birthYearMonth: '出生年月', gradeLevel: '年级', sexAtBirth: '出生时性别', primaryLanguage: '主要语言', countryOrRegion: '国家或地区',
}
const options: Partial<Record<ScaleContextKey, Array<[string, string]>>> = {
  gradeLevel: [['K', '幼儿园'], ...Array.from({ length: 12 }, (_, i): [string, string] => [String(i + 1), `${i + 1} 年级`])],
  sexAtBirth: [['female', '女'], ['male', '男'], ['intersex', '间性'], ['not_disclosed', '不愿透露']],
}
export default function ScaleContextPreflight({ requiredKeys, onSubmit }: {
  requiredKeys: ScaleContextKey[]
  onSubmit: (values: Partial<Record<ScaleContextKey, string>>) => void
}) {
  const [values, setValues] = useState<Partial<Record<ScaleContextKey, string>>>({})
  const submit = (event: FormEvent) => { event.preventDefault(); onSubmit(values) }
  return <ProductPage width="assessment">
    <form onSubmit={submit} className="space-y-5 rounded-xl bg-white p-6">
      <h1 className="text-xl font-semibold">开始前确认资料</h1>
      <p>请填写被测者本人的资料，用于确认本次测评是否适用。开始作答后，本轮资料将固定。</p>
      {requiredKeys.map(key => <label key={key} className="block space-y-2">
        <span>{labels[key]}</span>
        {options[key] ? <select required value={values[key] ?? ''} onChange={e => setValues({ ...values, [key]: e.target.value })} className="block w-full rounded border p-2">
          <option value="">请选择</option>
          {options[key]!.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select> : <input required type={key === 'birthYearMonth' ? 'month' : 'text'}
          placeholder={key === 'primaryLanguage' ? '如 zh-CN' : key === 'countryOrRegion' ? '如 CN' : undefined}
          value={values[key] ?? ''} onChange={e => setValues({ ...values, [key]: e.target.value })}
          className="block w-full rounded border p-2" />}
      </label>)}
      <ProductButton type="submit" variant="primary">确认并开始</ProductButton>
    </form>
  </ProductPage>
}
