import * as legacy from './exportService.legacy'
import { projectExportData, resolveExportProjectionBinding } from './exportProjectionPolicy'
import type { ScaleDisclosureAudience } from '../modules/scale/policy/types'

export type { ExportData, ExportField, FieldNameContext } from './exportService.legacy'
export {
  spreadsheetSafeCell,
  serializeCsv,
  utcHalfOpenDateFilter,
  toPinyinFieldName,
  clearFieldNameCache,
  createFieldNameContext,
  exportDataToSPSS,
  writeExportDataFile,
} from './exportService.legacy'

export interface ExportOptions {
  anonymize?: boolean
  includeProgress?: boolean
  minProgress?: number
  dateRange?: { start?: string; end?: string }
  includeLabels?: boolean
  projectionAudience?: ScaleDisclosureAudience
}

export async function getScaleExportData(scaleId: string, options: ExportOptions = {}): Promise<legacy.ExportData> {
  const data = await legacy.getScaleExportData(scaleId, options)
  const binding = await resolveExportProjectionBinding('SCALE', scaleId, options.projectionAudience ?? 'researcher')
  return projectExportData(data, binding)
}

export async function getQuestionnaireExportData(questionnaireId: string, options: ExportOptions = {}): Promise<legacy.ExportData> {
  const data = await legacy.getQuestionnaireExportData(questionnaireId, options)
  const binding = await resolveExportProjectionBinding('QUESTIONNAIRE', questionnaireId, options.projectionAudience ?? 'researcher')
  return projectExportData(data, binding)
}

export async function exportToCSV(scaleId: string, options: ExportOptions = {}): Promise<string> {
  const data = await getScaleExportData(scaleId, options)
  return legacy.serializeCsv(data.fields, data.rows)
}

export async function exportToSPSS(scaleId: string, options: ExportOptions = {}) {
  const data = await getScaleExportData(scaleId, options)
  return legacy.exportDataToSPSS(data.fields, data.rows)
}

export async function saveExportFiles(
  scaleId: string,
  options: ExportOptions = {},
  format: 'csv' | 'sav' | 'spss' = 'csv',
  precomputedData?: legacy.ExportData,
) {
  const data = precomputedData ?? await getScaleExportData(scaleId, options)
  return legacy.saveExportFiles(scaleId, options, format, data)
}

export async function exportToSav(scaleId: string, options: ExportOptions = {}): Promise<string> {
  const saved = await saveExportFiles(scaleId, options, 'sav')
  if (!saved.savPath) throw new Error('SAV 导出失败')
  return saved.savPath
}

export async function exportQuestionnaireToCSV(questionnaireId: string, options: ExportOptions = {}): Promise<string> {
  const data = await getQuestionnaireExportData(questionnaireId, options)
  return legacy.serializeCsv(data.fields, data.rows)
}

export async function saveQuestionnaireExportFiles(
  questionnaireId: string,
  options: ExportOptions = {},
  format: 'csv' | 'sav' = 'csv',
  precomputedData?: legacy.ExportData,
) {
  const data = precomputedData ?? await getQuestionnaireExportData(questionnaireId, options)
  return legacy.saveQuestionnaireExportFiles(questionnaireId, options, format, data)
}

export async function exportQuestionnaireToSav(questionnaireId: string, options: ExportOptions = {}): Promise<string> {
  const saved = await saveQuestionnaireExportFiles(questionnaireId, options, 'sav')
  if (!saved.savPath) throw new Error('SAV 导出失败')
  return saved.savPath
}

export const exportService = {
  toPinyinFieldName: legacy.toPinyinFieldName,
  getScaleExportData,
  exportToCSV,
  exportToSPSS,
  exportToSav,
  saveExportFiles,
  clearFieldNameCache: legacy.clearFieldNameCache,
  getQuestionnaireExportData,
  exportQuestionnaireToCSV,
  exportQuestionnaireToSav,
  saveQuestionnaireExportFiles,
}
