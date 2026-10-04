import type { Projection } from '../../api/parents'
import { ProductStatus } from '../../components/product-ui'
export default function ParentReportView({ report }: { report: Projection }) {
  if (
    !report ||
    report.audience !== 'PARENT' ||
    typeof report.title !== 'string' ||
    typeof report.summary !== 'string' ||
    !Array.isArray(report.blocks) ||
    report.blocks.some(
      (block) =>
        !block ||
        typeof block.title !== 'string' ||
        typeof block.text !== 'string',
    )
  )
    return (
      <ProductStatus kind="error" title="报告格式暂不支持">
        请返回列表重新加载。
      </ProductStatus>
    )
  return (
    <article className="space-y-5" aria-label="家长版报告">
      <h2 className="text-xl font-semibold">{report.title}</h2>
      {report.summary && (
        <p className="whitespace-pre-wrap leading-relaxed">{report.summary}</p>
      )}
      {report.blocks.map((block, index) => (
        <section
          key={index}
          className="rounded-xl border border-slate-200 bg-white p-4"
        >
          <h3 className="font-semibold">{block.title}</h3>
          <p className="mt-2 whitespace-pre-wrap leading-relaxed">
            {block.text}
          </p>
        </section>
      ))}
      {!report.summary && !report.blocks.length && (
        <p className="text-slate-600">本份报告展示测评完成情况。</p>
      )}
    </article>
  )
}
