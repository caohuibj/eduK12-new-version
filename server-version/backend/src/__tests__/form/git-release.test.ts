import { mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { canonicalHash } from '../../modules/assessment-runtime/canonical'
import { checkFormGitRelease } from '../../modules/form/git-release'

const key = 'synthetic_form'

function withRelease(check: (root: string, files: {
  content: string; report: string; index: string;
}) => void) {
  const root = mkdtempSync(join(tmpdir(), 'form-git-release-test-'))
  const directory = join(root, key)
  mkdirSync(join(directory, 'reports'), { recursive: true })
  const files = {
    content: join(directory, '1.0.0.json'),
    report: join(directory, 'reports/2.0.0.json'),
    index: join(directory, 'releases.json'),
  }
  const content = {
    schemaVersion: 1, toolKey: key, version: '1.0.0', title: 'Synthetic Form', statement: 'Synthetic fixture only',
    definition: { schemaVersion: 2, pages: [{ pageKey: 'page', title: 'Selection', questions: [
      { itemKey: 'choice', type: 'SINGLE', prompt: 'Choose one', required: true,
        options: [{ optionKey: 'yes', label: 'Yes' }, { optionKey: 'no', label: 'No' }], rows: [] },
      { itemKey: 'why', type: 'SHORT_TEXT', prompt: 'Why', required: true, maxLength: 10, options: [], rows: [],
        displayIf: { itemKey: 'choice', operator: 'EQUALS', optionKey: 'yes' } },
    ] }] },
    dataCeiling: { schemaVersion: 1, policyVersion: 'C1', unknownAudience: 'DENY', audiences: {
      researcher: { rawAnswers: true, itemScores: false, methods: false, resultQualityDetails: false },
      subject: { rawAnswers: false, itemScores: false, methods: false, resultQualityDetails: false },
    } },
    reference: {}, representativeCase: { synthetic: true, answers: { choice: 'no' },
      expected: { rawAnswers: { choice: 'no' }, missing: [{ itemKey: 'why', reason: 'NOT_SHOWN' }] } },
  }
  const contentHash = canonicalHash(content)
  const report = {
    schemaVersion: 1, toolKey: key, version: '2.0.0', contentVersion: '1.0.0', contentHash,
    reportVisibility: { schemaVersion: 1, policyVersion: 'R2', unknownAudience: 'DENY', audiences: {
      subject: { numericScores: false, references: false, scoreDerivedLabels: false, individualInterpretations: false,
        educationalContent: true, artwork: false },
    } },
    template: { blocks: [{ type: 'TEXT', text: 'Synthetic completion text' }], limitations: [] },
  }
  const index = { schemaVersion: 1, toolKey: key, releases: [{ releaseKey: '1.0.1', contentVersion: '1.0.0',
    reportVersion: '2.0.0', contentHash, reportHash: canonicalHash(report), state: 'HOLD', allowedProducts: ['SURVEY'] }] }
  try {
    writeFileSync(files.content, JSON.stringify(content))
    writeFileSync(files.report, JSON.stringify(report))
    writeFileSync(files.index, JSON.stringify(index))
    check(root, files)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}

describe('Form Git release declaration', () => {
  it('validates a branching synthetic case and freezes distinct C/R disclosure without enabling the release', () => {
    withRelease(root => {
      const { releases: [release] } = checkFormGitRelease(root, key)
      expect(release.state).toBe('HOLD')
      expect(release.prepared.provenance).toMatchObject({
        contentVersion: '1.0.0', reportVersion: '2.0.0',
        effectiveDisclosure: { audiences: {
          researcher: { rawAnswers: true, educationalContent: false },
          subject: { rawAnswers: false, numericScores: false, educationalContent: true },
        } },
      })
    })
  })

  it('rejects changed file hashes and symlinks', () => {
    withRelease((root, files) => {
      const previous = readFileSync(files.report, 'utf8')
      const changed = JSON.parse(previous)
      changed.template.blocks[0].text = 'Rewritten version'
      writeFileSync(files.report, JSON.stringify(changed))
      expect(() => checkFormGitRelease(root, key)).toThrow('FORM_RELEASE_AXIS_HASH_MISMATCH')
      rmSync(files.report)
      symlinkSync(files.content, files.report)
      expect(() => checkFormGitRelease(root, key)).toThrow('FORM_RELEASE_REGULAR_JSON_REQUIRED')
    })
  })

  it('rejects malformed branch fixtures and an R axis expanding score access even with updated declared hashes', () => {
    withRelease((root, files) => {
      const content = JSON.parse(readFileSync(files.content, 'utf8'))
      const report = JSON.parse(readFileSync(files.report, 'utf8'))
      const index = JSON.parse(readFileSync(files.index, 'utf8'))
      content.representativeCase.expected.missing = []
      index.releases[0].contentHash = report.contentHash = canonicalHash(content)
      index.releases[0].reportHash = canonicalHash(report)
      for (const [file, value] of [[files.content, content], [files.report, report], [files.index, index]])
        writeFileSync(file, JSON.stringify(value))
      expect(() => checkFormGitRelease(root, key)).toThrow('FORM_RELEASE_REPRESENTATIVE_CASE_MISMATCH')
      report.reportVisibility.audiences.subject.numericScores = true
      index.releases[0].reportHash = canonicalHash(report)
      writeFileSync(files.report, JSON.stringify(report))
      writeFileSync(files.index, JSON.stringify(index))
      expect(() => checkFormGitRelease(root, key)).toThrow('FORM_RELEASE_VISIBILITY_REQUIRES_NON_SCORING_CAPABILITIES')
    })
  })
})
