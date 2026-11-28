import { z } from 'zod'
import { readRosterWorkbook } from '../education-roster/workbook'
import { formImportIssues, formImportKey, formImportQuestions } from '../assessment-core/form/import-builder'
import { parseCsv, parseText } from '../assessment-core/form/import-parser'
import { validateFormDefinition, type FormDraft } from '../assessment-core/form/definition'
import { AdminPermissionError } from '../admin-permissions/service'

const inputSchema = z.object({
  format: z.enum(['TEXT', 'CSV', 'XLSX']),
  content: z.string().min(1).max(200000),
  batchId: z.string().uuid(),
}).strict()

const csvCell = (text: string) => '"' + text.replace(/"/g, '""') + '"'

export async function previewFormTemplateImport(raw: unknown) {
  const { format, content, batchId } = inputSchema.parse(raw)
  if (Buffer.byteLength(content, 'utf8') > 200000) throw new AdminPermissionError(400, '表单导入内容超过 200 KB')
  let input = content
  if (format === 'XLSX') {
    try {
      if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(content))
        throw new Error('Excel 文件编码无效')
      const workbook = await readRosterWorkbook(Buffer.from(content, 'base64'))
      if (workbook.sheets.length !== 1) throw new Error('表单 Excel 只接受一个非空工作表')
      input = workbook.sheets[0].rows.map(row => row.cells.map(csvCell).join(',')).join('\n')
    } catch (cause) {
      throw new AdminPermissionError(400, cause instanceof Error ? cause.message : '无法读取表单 Excel')
    }
  }
  const parsed = format === 'TEXT' ? parseText(input) : parseCsv(input)
  const issues = [...parsed.issues, ...formImportIssues(parsed.rows, 2)]
  if (parsed.rows.length > 200) issues.push({ line: 1, message: '每批最多导入 200 道题目' })
  if (issues.length) return { definition: null, issues }
  const questions = formImportQuestions(parsed.rows, batchId)
  const pages: FormDraft['pages'] = []
  for (let start = 0; start < questions.length; start += 80) {
    pages.push({
      pageKey: formImportKey(batchId, 'page' + start),
      title: '导入表单 · ' + (pages.length + 1),
      questions: questions.slice(start, start + 80),
    })
  }
  const checked = validateFormDefinition({ schemaVersion: 2, pages }, { forPreview: true })
  if (!checked.definition || checked.issues.length) return {
    definition: null,
    issues: checked.issues.map(issue => ({ line: 1, message: issue.path + '：' + issue.message })),
  }
  return { definition: checked.definition, issues: [] }
}
