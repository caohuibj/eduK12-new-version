import { mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { canonicalHash } from '../../modules/assessment-runtime/canonical'
import { checkFormGitRelease, syncFormGitReleases } from '../../modules/form/git-release'

const { publish } = vi.hoisted(() => ({ publish: vi.fn() }))
vi.mock('../../modules/form/publication', () => ({ publishFormGitRelease: publish }))

const key = 'synthetic_form'

async function withRelease(check: (root: string, files: {
  content: string; report: string; index: string;
}) => void | Promise<void>) {
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
    reportVersion: '2.0.0', contentHash, reportHash: canonicalHash(report), state: 'HOLD', allowedEntries: ['SURVEY'] }] }
  try {
    writeFileSync(files.content, JSON.stringify(content))
    writeFileSync(files.report, JSON.stringify(report))
    writeFileSync(files.index, JSON.stringify(index))
    await check(root, files)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}

describe('Form Git release declaration', () => {
  it('validates a branching synthetic case and freezes distinct C/R disclosure without enabling the release', async () => {
    await withRelease(root => {
      const { releases: [release] } = checkFormGitRelease(root, key)
      expect(release).toMatchObject({ state: 'HOLD', effectiveState: 'HOLD', allowedEntries: ['SURVEY'] })
      expect(release.prepared.provenance).toMatchObject({
        contentVersion: '1.0.0', reportVersion: '2.0.0',
        effectiveDisclosure: { audiences: {
          researcher: { rawAnswers: true, educationalContent: false },
          subject: { rawAnswers: false, numericScores: false, educationalContent: true },
        } },
      })
    })
  })

  it('replaces the declared ONLINE predecessor and restores it on explicit rollback', async () => {
    publish.mockClear()
    await withRelease(async (root, files) => {
      const previous = JSON.parse(readFileSync(files.index, 'utf8'))
      const formerReport = JSON.parse(readFileSync(files.report, 'utf8'))
      const replacementReport = {
        ...formerReport,
        version: '3.0.0',
        template: { blocks: [{ type: 'TEXT', text: 'New completion version' }], limitations: [] },
      }
      const predecessor = { ...previous.releases[0], state: 'ONLINE' }
      const replacement = {
        ...predecessor,
        releaseKey: '1.0.2',
        reportVersion: '3.0.0',
        reportHash: canonicalHash(replacementReport),
        replaces: predecessor.releaseKey,
      }
      writeFileSync(join(root, key, 'reports/3.0.0.json'), JSON.stringify(replacementReport))
      const tx = {} as import('@prisma/client').Prisma.TransactionClient
      const sha = 'a'.repeat(40)
      writeFileSync(files.index, JSON.stringify({ ...previous, releases: [predecessor, replacement] }))
      await syncFormGitReleases(root, tx, 'git-actor', sha)
      expect(publish.mock.calls.map(([, , release]) => [release.releaseKey, release.state, release.effectiveState])).toEqual([
        ['1.0.1', 'ONLINE', 'WITHDRAWN'],
        ['1.0.2', 'ONLINE', 'ONLINE'],
      ])
      publish.mockClear()
      writeFileSync(files.index, JSON.stringify({
        ...previous, releases: [predecessor, { ...replacement, state: 'WITHDRAWN' }],
      }))
      await syncFormGitReleases(root, tx, 'git-actor', sha)
      expect(publish.mock.calls.map(([, , release]) => [release.releaseKey, release.effectiveState])).toEqual([
        ['1.0.1', 'ONLINE'],
        ['1.0.2', 'WITHDRAWN'],
      ])
    })
  })

  it('preserves a standalone HOLD and rejects legacy or unsupported entry fields', async () => {
    publish.mockClear()
    await withRelease(async (root, files) => {
      const tx = {} as import('@prisma/client').Prisma.TransactionClient
      expect(await syncFormGitReleases(root, tx, 'git-actor', 'a'.repeat(40))).toEqual([])
      expect(publish).not.toHaveBeenCalled()
      const index = JSON.parse(readFileSync(files.index, 'utf8'))
      index.releases[0].allowedEntries = ['TRAINING']
      writeFileSync(files.index, JSON.stringify(index))
      expect(() => checkFormGitRelease(root, key)).toThrow()
      const { allowedEntries: _, ...legacy } = index.releases[0]
      index.releases = [{ ...legacy, allowedProducts: ['SURVEY'] }]
      writeFileSync(files.index, JSON.stringify(index))
      expect(() => checkFormGitRelease(root, key)).toThrow()
    })
  })

  it('rejects changed file hashes and symlinks', async () => {
    await withRelease((root, files) => {
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

  it('rejects malformed branch fixtures and an R axis expanding score access even with updated declared hashes', async () => {
    await withRelease((root, files) => {
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
