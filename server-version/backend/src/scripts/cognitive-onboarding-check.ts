import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import {
  composeCognitiveOnboardingDecision,
  serializeCognitiveOnboardingDecision,
  formatCognitiveOnboardingDecision,
  type CognitiveBlockerV1,
} from '../modules/cognitive/onboarding/decision'
const manifests = require('../../../scripts/cognitive/manifests.cjs')
const dependencies = require('../../../scripts/cognitive/dependencies.cjs')
const { runAcceptance } = require('../../../scripts/cognitive/acceptance.cjs')
const {
  classifyChangedPath,
} = require('../../../scripts/cognitive/content-policy.cjs')

async function main() {
  const args = process.argv.slice(2),
    task = args[0],
    json = args.includes('--json')
  const technical: CognitiveBlockerV1[] = []
  const add = (
    code: string,
    domain: CognitiveBlockerV1['domain'],
    message: string,
    file?: string,
    fieldPath?: string,
  ): CognitiveBlockerV1 => ({
    schemaVersion: 1,
    code,
    domain,
    message,
    file,
    fieldPath,
    severity: 'ERROR',
    gate: 'TECHNICAL_BUILD',
    remediation: {
      type: 'EDIT_FIELD',
      hint: 'Repair the indicated task contract and rerun this command.',
    },
  })
  let packages: any[] = []
  try {
    packages = manifests.discover()
    // An unknown task is already fail-closed; do not load or scan every runtime
    // just to report a misspelled directory. Valid targets retain all gates.
    if (task === '--all' || packages.some((p) => p.task === task)) {
      manifests.generate({ check: true })
      dependencies.guard(manifests.ROOT, packages)
    }
  } catch (e) {
    technical.push(
      add(
        'COG_REGISTRATION_CHECK_FAILED',
        String(e).includes('COG_ASSET') ? 'ASSET' : 'REGISTRATION',
        (e as Error).message,
      ),
    )
  }
  const selectedPackages =
    task === '--all' ? packages : packages.filter((p) => p.task === task)
  const selected = selectedPackages.length
    ? {
        ...selectedPackages[0],
        acceptance: {
          frontendSuites: [
            ...new Set(
              selectedPackages.flatMap(
                (p) => p.acceptance?.frontendSuites ?? [],
              ),
            ),
          ],
        },
      }
    : undefined
  for (const p of selectedPackages)
    if (!p.acceptance?.frontendSuites?.length)
      technical.push(
        add(
          'COG_RUNNER_EVIDENCE_MISSING',
          'EXECUTION',
          'Task must declare executable frontend acceptance suites.',
          p.file,
          'acceptance.frontendSuites',
        ),
      )
  if (selected)
    try {
      runAcceptance(manifests.ROOT, selected)
    } catch (e) {
      technical.push(
        add(
          'COG_RUNNER_ACCEPTANCE_FAILED',
          'EXECUTION',
          (e as Error).message,
          selected.file,
          'acceptance.frontendSuites',
        ),
      )
    }
  if (!selected)
    technical.push(
      add(
        'COG_TASK_NOT_FOUND',
        'IDENTITY',
        'Supply one discovered task directory name.',
      ),
    )
  if (args.includes('--content-only')) {
    const base = args[args.indexOf('--base') + 1]
    if (!args.includes('--base') || !base || !/^[0-9a-f]{40}$/.test(base))
      technical.push(
        add(
          'COG_COMPATIBILITY_BASE_REQUIRED',
          'COMPATIBILITY',
          'Content-only checks require --base <full commit SHA>.',
        ),
      )
    else
      try {
        const names = execFileSync(
          'git',
          ['diff', '--name-only', '--no-renames', '-z', base, '--'],
          { cwd: manifests.ROOT, encoding: 'utf8' },
        )
          .split('\0')
          .filter(Boolean)
        names.push(
          ...execFileSync(
            'git',
            ['ls-files', '--others', '--exclude-standard', '-z'],
            { cwd: manifests.ROOT, encoding: 'utf8' },
          )
            .split('\0')
            .filter(Boolean),
        )
        for (const file of [...new Set(names)].sort())
          if (classifyChangedPath(file, packages) === 'SHARED_CORE')
            technical.push(
              add(
                'COG_SHARED_CORE_CHANGE',
                'COMPATIBILITY',
                'Change is outside the task-owned content boundary.',
                file,
              ),
            )
      } catch (e) {
        technical.push(
          add(
            'COG_COMPATIBILITY_DIFF_FAILED',
            'COMPATIBILITY',
            (e as Error).message,
          ),
        )
      }
  }
  const decisions = []
  if (selectedPackages.length) try {
    const { getCognitiveRegistryEntry } = await import(
      '../modules/cognitive/cognitive.registry'
    )
    const { buildCognitiveV2TaskDefinition } = await import(
      '../modules/cognitive/v2/registry'
    )
    const { validateTaskDefinition } = await import(
      '../modules/cognitive/v2/publication-gate'
    )
    const { evaluateCognitiveProductReadiness } = await import(
      '../modules/cognitive/library/product-readiness'
    )
    const { evaluateCognitiveScientificQualification } = await import(
      '../modules/cognitive/library/scientific-qualification'
    )
    const { cognitiveGovernance } = await import(
      '../modules/cognitive/generated/scientific'
    )
    const { cognitiveSeeds } = await import(
      '../modules/cognitive/generated/seeds'
    )
    const { resolveParticipantPresentation } = await import(
      '../modules/cognitive/participant-presentation'
    )
    const { validateExecutableFixtures } = await import(
      '../modules/cognitive/onboarding/fixtures'
    )
    for (const selected of selectedPackages)
      for (const id of selected.identities) {
        const local = [...technical],
          pilot: CognitiveBlockerV1[] = []
        const entry = getCognitiveRegistryEntry(
          id.testType,
          id.engineVersion,
          id.scoringVersion,
        )
        if (!entry)
          throw new Error(
            'Declared execution export is absent from the generated runtime registry.',
          )
        const definition = buildCognitiveV2TaskDefinition(entry)
        for (const issue of validateTaskDefinition(definition).filter(
          (i) => i.severity === 'error',
        )) {
          const prefix = issue.path.split('.')[0],
            domains: Record<string, CognitiveBlockerV1['domain']> = {
              profiles: 'PROFILE',
              protocol: 'PROTOCOL',
              metrics: 'METRIC',
              quality: 'QUALITY',
              report: 'REPORT',
              scorer: 'SCORING',
              finalSubmission: 'EXECUTION',
            }
          pilot.push({
            ...add(
              'COG_TASK_CONTRACT_INVALID',
              domains[prefix] ?? 'IDENTITY',
              issue.message,
              selected.backendFile,
              issue.path,
            ),
            gate: 'PILOT_PUBLISH',
          })
        }
        const seeds = cognitiveSeeds.filter(
          (s) =>
            s.testType === id.testType &&
            s.engineVersion === id.engineVersion &&
            s.scoringVersion === id.scoringVersion,
        )
        if (!seeds.length)
          pilot.push({
            ...add(
              'COG_CONFIG_FIXTURE_MISSING',
              'PROFILE',
              'Exact-identity seed config required.',
              selected.seedFile,
            ),
            gate: 'PILOT_PUBLISH',
          })
        for (const seed of seeds)
          for (const issue of evaluateCognitiveProductReadiness(
            definition,
            seed.config,
          ).blockers)
            pilot.push({
              ...add(
                'COG_' + issue.code,
                'EXECUTION',
                issue.message,
                selected.seedFile,
              ),
              gate: 'PILOT_PUBLISH',
            })
        const presentation = resolveParticipantPresentation(id)
        if (
          !presentation?.title ||
          !presentation.disclaimer ||
          !presentation.presentationVersion
        )
          local.push(
            add(
              'COG_PRESENTATION_INVALID',
              'PRESENTATION',
              'Versioned participant presentation is required.',
              selected.presentationFile,
            ),
          )
        const file = `${selected.directory}/fixtures/${id.engineVersion}-${id.scoringVersion}.json`
        try {
          pilot.push(
            ...validateExecutableFixtures(
              entry,
              JSON.parse(
                fs.readFileSync(path.join(manifests.ROOT, file), 'utf8'),
              ),
              file,
            ),
          )
        } catch (e) {
          pilot.push({
            ...add(
              'COG_FIXTURE_LOAD_FAILED',
              'SCORING',
              (e as Error).message,
              file,
            ),
            gate: 'PILOT_PUBLISH',
          })
        }
        const governance = cognitiveGovernance.filter(
          (g) =>
            g.testType === id.testType &&
            g.engineVersion === id.engineVersion &&
            g.scoringVersion === id.scoringVersion,
        )
        if (governance.length !== 1)
          local.push(
            add(
              'COG_GOVERNANCE_IDENTITY_INVALID',
              'GOVERNANCE',
              'Exactly one governance record is required.',
              selected.scientificFile,
            ),
          )
        const scientific = evaluateCognitiveScientificQualification(definition)
        decisions.push(
          composeCognitiveOnboardingDecision({
            identity: {
              testType: id.testType,
              engineVersion: id.engineVersion,
              scoringVersion: id.scoringVersion,
            },
            technicalBlockers: local,
            pilotPublishBlockers: pilot,
            scientific: {
              declaredMaturity: governance[0]?.declaredMaturity ?? 'PILOT',
              maxEligibleMaturity: scientific.maxEligibleMaturity,
              blockersToNextTier:
                'blockersToNextTier' in scientific
                  ? (scientific.blockersToNextTier as CognitiveBlockerV1[])
                  : [],
            },
          }),
        )
      }
  } catch (e) {
    technical.push(
      add('COG_VALIDATION_ABORTED', 'EXECUTION', (e as Error).message),
    )
  }
  if (
    !decisions.length ||
    technical.some((b) => b.code === 'COG_VALIDATION_ABORTED')
  ) {
    decisions.length = 0
    decisions.push(
      composeCognitiveOnboardingDecision({
        identity: {
          testType: task || 'UNKNOWN',
          engineVersion: 'UNKNOWN',
          scoringVersion: 'UNKNOWN',
        },
        technicalBlockers: technical,
        pilotPublishBlockers: [],
        scientific: {
          declaredMaturity: 'PILOT',
          maxEligibleMaturity: 'PILOT',
          blockersToNextTier: [],
        },
      }),
    )
  }
  for (const d of decisions)
    process.stdout.write(
      json
        ? serializeCognitiveOnboardingDecision(d)
        : formatCognitiveOnboardingDecision(d),
    )
  if (
    decisions.some(
      (d) => !d.pilotPublish.ready || !d.scientific.declarationValid,
    )
  )
    process.exitCode = 1
}
void main().catch((error) => {
  process.stderr.write(String(error) + '\n')
  process.exitCode = 1
})
