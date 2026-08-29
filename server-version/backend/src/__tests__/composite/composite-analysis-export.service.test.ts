import { describe, expect, it } from 'vitest'
import ExcelJS from 'exceljs'
import { buildCompositeAnalysisExport } from '../../modules/composite/composite-analysis-export.service'
import type { CompositeAnalysisExportContext } from '../../modules/composite/composite-analysis-export.service'

const centralDirectoryNames = (zip: Buffer): string[] => {
  const names: string[] = []
  let offset = 0
  while (offset <= zip.length - 46) {
    if (zip.readUInt32LE(offset) !== 0x02014b50) {
      offset += 1
      continue
    }
    const nameLength = zip.readUInt16LE(offset + 28)
    names.push(zip.subarray(offset + 46, offset + 46 + nameLength).toString('utf8'))
    offset += 46 + nameLength + zip.readUInt16LE(offset + 30) + zip.readUInt16LE(offset + 32)
  }
  return names
}

const zipEntry = (zip: Buffer, target: string): string => {
  let offset = 0
  while (offset <= zip.length - 30) {
    if (zip.readUInt32LE(offset) !== 0x04034b50) {
      offset += 1
      continue
    }
    const nameLength = zip.readUInt16LE(offset + 26)
    const extraLength = zip.readUInt16LE(offset + 28)
    const name = zip.subarray(offset + 30, offset + 30 + nameLength).toString('utf8')
    const dataStart = offset + 30 + nameLength + extraLength
    const dataLength = zip.readUInt32LE(offset + 18)
    if (name === target) return zip.subarray(dataStart, dataStart + dataLength).toString('utf8')
    offset = dataStart + dataLength
  }
  throw new Error(`missing zip entry ${target}`)
}

const makeContext = (audience: 'participant' | 'teacher' | 'researcher'): CompositeAnalysisExportContext => {
  const context = {
  attemptId: 'attempt-1',
  assessmentId: 'assessment-1',
  assessmentName: '跨来源报告',
  audience,
  packageSnapshot: {
    snapshotVersion: 2,
    packageKey: 'inhibitory_control_multisource_v1',
    packageVersion: '1.0.0',
    profile: 'research',
    packageDefinition: { name: '跨来源画像' },
  } as any,
  snapshot: {
    id: 'snapshot-1',
    attemptId: 'attempt-1',
    packageKey: 'inhibitory_control_multisource_v1',
    packageVersion: '1.0.0',
    analysisDefinitionVersion: '1.0.0',
    analysisVersion: 'analysis-1',
    reportSchemaVersion: 'schema-1',
    inputFingerprint: 'f'.repeat(64),
    generationReason: 'COMPLETION',
    generatedBy: 'admin-1',
    createdAt: new Date('2026-08-25T00:00:00Z'),
    payload: {
      packageKey: 'inhibitory_control_multisource_v1',
      packageVersion: '1.0.0',
      analysisProtocolKey: 'inhibitory_control_multisource_v1',
      analysisProtocolVersion: '1.0.0',
      profile: 'research',
      analysisVersion: 'analysis-1',
      reportSchemaVersion: 'schema-1',
      qualitySummary: { interpretableModules: 1, excludedModules: [], warnings: [] },
      evidence: [{
        id: 'evidence-1',
        sourceType: 'cognitive_metric',
        sourceResultId: 'source-1',
        construct: 'response_inhibition',
        facet: 'action_withholding',
        metricKey: 'commissionRate',
        value: { zero: 0, empty: '', nested: { payloadEncrypted: 'must-not-leak', keep: true } },
        unit: 'ratio',
        role: 'primary',
        interpretation: 'criterion',
        directionClass: 'more_difficulty',
        interpretable: true,
        qualityFlags: [],
        provenance: { slotKey: 'gonogo', testType: 'gonogo', payloadEncrypted: 'must-not-leak' },
      }],
      cognitiveDomains: [{
        domain: 'response_inhibition',
        label: '抑制控制',
        status: 'interpretable',
        evidence: [],
        consistency: 'not_applicable',
        summary: '=1+1',
        strengths: [],
        watchItems: ['观察'],
        caveats: [],
      }],
      crossSourceFindings: [{
        construct: 'response_inhibition',
        type: 'paired_description',
        evidenceRefs: ['evidence-1'],
        summary: '并列描述',
        confidence: 'descriptive',
      }],
      recommendations: [{
        ruleId: 'clear_difficulty_watch',
        ruleVersion: '1.1.0',
        audience: 'researcher',
        priority: 'watch',
        evidenceRefs: ['evidence-1'],
        text: '仅作描述性观察',
      }],
      limitations: ['不作诊断'],
      provenance: { packageKey: 'inhibitory_control_multisource_v1', payloadEncrypted: 'must-not-leak' },
    },
  } as any,
  } as any as CompositeAnalysisExportContext
  context.snapshot.payload.cognitiveDomains[0].evidence = context.snapshot.payload.evidence
  return context
}

describe('PR11 frozen composite analysis exports', () => {
  it('keeps participant and teacher JSON within their existing safe projection', async () => {
    const participant = await buildCompositeAnalysisExport(makeContext('participant'), 'json')
    const teacher = await buildCompositeAnalysisExport(makeContext('teacher'), 'json')
    const participantJson = participant.body.toString('utf8')
    const teacherJson = teacher.body.toString('utf8')

    expect(participant.fileName).toBe('analysis.json')
    expect(JSON.parse(participantJson)).not.toHaveProperty('snapshot')
    expect(participantJson).not.toContain('payloadEncrypted')
    expect(teacherJson).not.toContain('sourceResultId')
    expect(teacherJson).not.toContain('source_result_id')
    expect(teacherJson).not.toContain('inputFingerprint')
    expect(JSON.parse(teacherJson).snapshot).toMatchObject({ id: 'snapshot-1', generationReason: 'COMPLETION' })

    const participantContext = makeContext('participant')
    participantContext.snapshot.generationReason = 'REANALYSIS'
    const participantZip = await buildCompositeAnalysisExport(participantContext, 'zip')
    expect(zipEntry(participantZip.body, 'README.txt')).not.toContain('REANALYSIS')
  })

  it('exports researcher evidence, preserves zero/structured values and neutralizes CSV formulas', async () => {
    const context = makeContext('researcher')
    const zip = await buildCompositeAnalysisExport(context, 'zip')
    const xlsx = await buildCompositeAnalysisExport(context, 'xlsx')

    expect(centralDirectoryNames(zip.body)).toEqual([
      'analysis.json',
      'domain_evidence.csv',
      'cross_source_findings.csv',
      'recommendations.csv',
      'README.txt',
    ])
    expect(zipEntry(zip.body, 'domain_evidence.csv')).toContain("'=1+1")
    expect(zip.body.toString('utf8')).not.toContain('payloadEncrypted')
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.load(xlsx.body)
    expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual(['Analysis', 'DomainEvidence', 'Findings', 'Recommendations', 'Provenance'])
    expect(xlsx.body.toString('utf8')).not.toContain('payloadEncrypted')

    const domainSheet = workbook.getWorksheet('DomainEvidence')!
    const headers = (domainSheet.getRow(1).values as unknown[]).slice(1) as string[]
    const firstRow = domainSheet.getRow(2).values as unknown[]
    const domainRecord = Object.fromEntries(headers.map((header, index) => [header, firstRow[index + 1]]))

    expect(domainRecord).toMatchObject({ row_type: 'evidence', source_result_id: 'source-1', value_json: expect.stringContaining('"zero":0') })

    const teacherZip = await buildCompositeAnalysisExport(makeContext('teacher'), 'zip')
    expect(zipEntry(teacherZip.body, 'domain_evidence.csv')).toContain('source_summary')
  })
})
