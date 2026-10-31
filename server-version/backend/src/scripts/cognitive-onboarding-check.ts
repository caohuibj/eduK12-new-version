import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import {
  composeCognitiveOnboardingDecision,
  serializeCognitiveOnboardingDecision,
  formatCognitiveOnboardingDecision,
  cognitiveOnboardingExitCode,
  type CognitiveBlockerV1,
} from '../modules/cognitive/onboarding/decision'
const manifests = require('../../../scripts/cognitive/manifests.cjs')
const dependencies = require('../../../scripts/cognitive/dependencies.cjs')
const { selectOnboarding } = require('../../../scripts/cognitive/onboarding-selection.cjs')
const { runAcceptance } = require('../../../scripts/cognitive/acceptance.cjs')
const {
  classifyChangedPath,
} = require('../../../scripts/cognitive/content-policy.cjs')

async function main() {
  const args = process.argv.slice(2)
  const checks: any[] = [], identityResults: any[] = []
  let selection: any
  const record = (name: string, status: string, details?: unknown) => checks.push({name,status,...(details === undefined ? {} : {details})})
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
  packages = manifests.discover()
  try {
    selection = selectOnboarding(args, packages)
  } catch (error) {
    // Batch errors keep the atomic failure envelope in the outer handler.
    // Legacy callers still receive one schema-v1 decision, without running
    // manifest generation, acceptance or any validation after a bad selection.
    if (args.some(arg => arg === '--tasks' || arg === '--tasks-json')) throw error
    const positional = args.filter((arg, index) => !arg.startsWith('-') && args[index - 1] !== '--base')
    const task = positional.length === 1 ? positional[0] : args.includes('--all') ? '--all' : 'UNKNOWN'
    const code = /^COG_[A-Z0-9_]+/.exec((error as Error).message)?.[0] ?? 'COG_SELECTION_INVALID'
    const blockers: CognitiveBlockerV1[] = []
    if (positional.length === 1 && !packages.some(p => p.task === task))
      blockers.push(add('COG_TASK_NOT_FOUND', 'IDENTITY', 'Supply one discovered task directory name.'))
    if (code !== 'COG_SELECTION_INVALID_TASKS' || !blockers.length)
      blockers.push(add(code, code.startsWith('COG_COMPATIBILITY_') ? 'COMPATIBILITY' : 'IDENTITY',
        code === 'COG_COMPATIBILITY_BASE_REQUIRED'
          ? 'Content-only checks require --base <full commit SHA>.' : (error as Error).message))
    const decision = composeCognitiveOnboardingDecision({
      identity: { testType: task, engineVersion: 'UNKNOWN', scoringVersion: 'UNKNOWN' },
      technicalBlockers: blockers, pilotPublishBlockers: [],
      scientific: { declaredMaturity: 'PILOT', maxEligibleMaturity: 'PILOT', blockersToNextTier: [] },
    })
    process.stdout.write(args.includes('--json') ? serializeCognitiveOnboardingDecision(decision) : formatCognitiveOnboardingDecision(decision))
    throw error
  }
  const { json, selected: selectedPackages, frontendSuites } = selection
  try {
    manifests.generate({ check: true })
    record('manifest', 'PASS')
  } catch(e) {
    record('manifest', 'FAIL', (e as Error).message)
    technical.push(add('COG_REGISTRATION_CHECK_FAILED','REGISTRATION',(e as Error).message))
  }
  try {
    const modules = dependencies.guard(manifests.ROOT, packages)
    record('dependencies', 'PASS', {modules})
  } catch(e) {
    record('dependencies', 'FAIL', (e as Error).message)
    technical.push(add('COG_DEPENDENCY_CHECK_FAILED','EXECUTION',(e as Error).message))
  }
  for(const p of selectedPackages) if(!p.acceptance?.frontendSuites?.length)
    technical.push(add('COG_RUNNER_EVIDENCE_MISSING','EXECUTION','Task must declare executable frontend acceptance suites.',p.file))
  try {
    const count = runAcceptance(manifests.ROOT, {acceptance:{frontendSuites}})
    record('frontend-acceptance','PASS',{suites:frontendSuites,count})
  } catch(e) {
    record('frontend-acceptance','FAIL',{suites:frontendSuites,error:(e as Error).message})
    technical.push(add('COG_RUNNER_ACCEPTANCE_FAILED','EXECUTION',(e as Error).message))
  }
  if (selection.contentOnly) {
    const base = selection.base
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
  try {
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
        const stages: any[] = []
        const stage = (name: string, blockers: any[] = []) => stages.push({name,status:blockers.some(b=>b.severity==='ERROR')?'FAIL':'PASS'})
        try {
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
        stage('contract',pilot)
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
        stage('readiness',pilot)
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
        stage('presentation',local)
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
        stage('fixtures-scorer-report',pilot)
        const governance = cognitiveGovernance.filter(
          (g) =>
            g.testType === id.testType &&
            g.engineVersion === id.engineVersion &&
            g.scoringVersion === id.scoringVersion,
        )
        if (governance.length !== 1)
          local.push(
            {...add(
              'COG_GOVERNANCE_IDENTITY_INVALID',
              'GOVERNANCE',
              'Scientific metadata needs human review: expected one exact identity record; technical admission is evaluated separately.',
              selected.scientificFile,
            ),severity:'WARNING'},
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
        identityResults.push({identity:id,checks:stages})
        } catch(e) {
          const blocker=add('COG_IDENTITY_VALIDATION_ABORTED','EXECUTION',(e as Error).message)
          identityResults.push({identity:id,checks:[...stages,{name:'identity-completion',status:'FAIL',error:(e as Error).message}]})
          decisions.push(composeCognitiveOnboardingDecision({identity:id,technicalBlockers:[...technical,blocker],pilotPublishBlockers:[],scientific:{declaredMaturity:'PILOT',maxEligibleMaturity:'PILOT',blockersToNextTier:[]}}))
        }
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
          testType: selection.tasks.join(',') || 'UNKNOWN',
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
  const exitCode = cognitiveOnboardingExitCode(decisions)
  if(selection.batch) {
    process.stdout.write(JSON.stringify({schemaVersion:1,kind:'cognitive-onboarding-batch',selectedTasks:selection.tasks,
      selectedIdentities:selectedPackages.flatMap((p: any)=>p.identities.map(({testType,engineVersion,scoringVersion}: any)=>({testType,engineVersion,scoringVersion}))),
      checks,identityResults,decisions,selectionIsScopeEvidence:false,exitCode})+'\n')
  } else for (const d of decisions)
    process.stdout.write(json ? serializeCognitiveOnboardingDecision(d) : formatCognitiveOnboardingDecision(d))
  process.exitCode = exitCode
}
void main().catch((error) => {
  if(process.argv.some(arg=>arg==='--tasks'||arg==='--tasks-json')) process.stdout.write(JSON.stringify({schemaVersion:1,kind:'cognitive-onboarding-batch',selectedTasks:[],selectedIdentities:[],checks:[{name:'batch-completion',status:'FAIL',error:String(error)}],identityResults:[],decisions:[],selectionIsScopeEvidence:false,exitCode:1})+'\n')
  process.stderr.write(String(error) + '\n')
  process.exitCode = 1
})
