import { prisma } from '../config/database'
import { getScaleInstrumentRuntimePolicy } from '../modules/scale/onboarding/instrument-registry'
import { installScaleInstrument, planScaleInstrumentInstall } from '../modules/scale/onboarding/install'
import { scaleDeploymentModeSchema, type ScaleDeploymentModeV1 } from '../modules/scale/policy/deployment'

const args = process.argv.slice(2)
const flag = (name: string): string | undefined => {
  const index = args.indexOf(`--${name}`)
  return index >= 0 ? args[index + 1] : undefined
}
const repeated = (name: string): string[] => args.flatMap((entry, index) => (
  entry === `--${name}` && args[index + 1] ? [args[index + 1]!] : []
))
const has = (name: string): boolean => args.includes(`--${name}`)

const required = (name: string): string => {
  const value = flag(name)
  if (!value) throw new Error(`Missing --${name}`)
  return value
}

const main = async () => {
  const instrumentKey = required('instrument-key')
  const instrumentVersion = required('instrument-version')
  const locale = required('locale')
  const territory = required('territory').toUpperCase()
  const revision = Number(required('revision'))
  if (!Number.isInteger(revision) || revision <= 0) throw new Error('--revision must be a positive integer')
  const commercial = required('commercial')
  if (commercial !== 'NON_COMMERCIAL' && commercial !== 'COMMERCIAL') {
    throw new Error('--commercial must be NON_COMMERCIAL or COMMERCIAL')
  }
  const commercialNature: 'NON_COMMERCIAL' | 'COMMERCIAL' = commercial
  const deploymentModes = required('modes').split(',').filter(Boolean).map((mode) => scaleDeploymentModeSchema.parse(mode)) as ScaleDeploymentModeV1[]
  const authorizationRefs = repeated('authorization')
  if (authorizationRefs.length === 0) throw new Error('At least one --authorization is required')
  const actorUserId = required('actor-user-id')
  const runtimePolicy = getScaleInstrumentRuntimePolicy(instrumentKey, instrumentVersion)
  if (!runtimePolicy) throw new Error(`No compiled runtime policy for ${instrumentKey}@${instrumentVersion}`)

  const input = {
    instrumentKey,
    instrumentVersion,
    actorUserId,
    deploymentPolicy: {
      schemaVersion: 1 as const,
      revision,
      locale,
      territory,
      deploymentModes,
      commercialNature,
      requiredRightsActions: ['electronicAdministration', 'scoring', 'display'] as Array<'electronicAdministration' | 'scoring' | 'display'>,
      authorizationRefs,
      runtimePolicyHash: runtimePolicy.runtimePolicyHash,
      ...(flag('localization-version') ? { localizationVersion: flag('localization-version')! } : {}),
      inFlightCompletion: 'FROZEN_DEADLINE' as const,
    },
  }

  const result = has('apply')
    ? await installScaleInstrument(prisma, input)
    : await planScaleInstrumentInstall(prisma, input)
  process.stdout.write(`${JSON.stringify({ mode: has('apply') ? 'apply' : 'dry-run', ...result }, null, 2)}\n`)
  if (!result.allowActivation) process.exitCode = 2
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
  .finally(async () => prisma.$disconnect())
