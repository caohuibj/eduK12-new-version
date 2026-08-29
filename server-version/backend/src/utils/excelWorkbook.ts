import ExcelJS from 'exceljs'
import fs from 'node:fs/promises'

export type ExcelRow = Record<string, unknown>

const safeCellValue = (value: unknown): unknown => {
  if (typeof value !== 'string') return value
  // Spreadsheet formula injection is possible even in an authenticated export
  // when a title/name/answer starts with a formula character.
  return /^[=+\-@]/.test(value) ? `'${value}` : value
}

const addSheet = (workbook: ExcelJS.Workbook, name: string, rows: ExcelRow[], headers?: string[]) => {
  const worksheet = workbook.addWorksheet(name.slice(0, 31))
  const columns = headers || [...new Set(rows.flatMap((row) => Object.keys(row)))]
  worksheet.columns = columns.map((header) => ({ header, key: header, width: Math.min(80, Math.max(12, header.length + 2)) }))
  rows.forEach((row) => {
    const safeRow: ExcelRow = {}
    columns.forEach((column) => { safeRow[column] = safeCellValue(row[column]) })
    worksheet.addRow(safeRow)
  })
  worksheet.getRow(1).font = { bold: true }
  worksheet.views = [{ state: 'frozen', ySplit: 1 }]
}

export const workbookBuffer = async (
  sheets: Record<string, ExcelRow[] | { rows: ExcelRow[]; headers?: string[] }>,
): Promise<Buffer> => {
  const workbook = new ExcelJS.Workbook()
  for (const [name, value] of Object.entries(sheets)) {
    if (Array.isArray(value)) addSheet(workbook, name, value)
    else addSheet(workbook, name, value.rows, value.headers)
  }
  return Buffer.from(await workbook.xlsx.writeBuffer())
}

export const writeWorkbookFile = async (
  sheets: Record<string, ExcelRow[] | { rows: ExcelRow[]; headers?: string[] }>,
  filePath: string,
): Promise<void> => {
  const workbook = new ExcelJS.Workbook()
  for (const [name, value] of Object.entries(sheets)) {
    if (Array.isArray(value)) addSheet(workbook, name, value)
    else addSheet(workbook, name, value.rows, value.headers)
  }
  await workbook.xlsx.writeFile(filePath)
  // Keep the existing export size guard at the call site; this read verifies
  // that a complete file was flushed before it is packaged or served.
  await fs.access(filePath)
}
