import { existsSync, readFileSync } from 'node:fs'
import { dirname, relative, resolve } from 'node:path'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'
import { COGNITIVE_SEEDS } from '../../../prisma/seeds/cognitive'
import { listCognitiveRegistryEntries } from '../../modules/cognitive/cognitive.registry'

/**
 * Historical/release-reviewed seed baseline. This is intentionally explicit:
 * adding a future seed as PUBLISHED must modify this list in the same reviewed
 * change instead of silently bypassing publishCognitiveConfig/Product Readiness.
 */
const APPROVED_PUBLISHED_SEED_BASELINE = new Set([
  'reaction/1.0.1',
  'memory/1.0.1',
  'stroop/1.0.1',
  'reaction/1.1.0',
  'memory/1.1.0',
  'stroop/1.1.0',
  'gonogo/1.0.0',
  'cpt/1.0.0',
  'nback/1.0.0',
  'sst/1.0.0',
  'taskswitch/1.0.0',
  'corsi/1.0.0',
])

const REPOSITORY_ROOT = resolve(__dirname, '../../../../..')
const FRONTEND_COGNITIVE_ROOT = resolve(REPOSITORY_ROOT, 'server-version/frontend/src/modules/cognitive')
const FRONTEND_REGISTRY_PATH = resolve(FRONTEND_COGNITIVE_ROOT, 'generated/runners.ts')

const escapeRegex = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// Read the selected export, including the registry's explicit object spreads.
// This checks identity values without importing browser runners into a backend test.
const registryString = (file: string, name: string, key: string): string | undefined => {
  const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true)
  const declaration = source.statements.filter(ts.isVariableStatement)
    .flatMap(statement => [...statement.declarationList.declarations])
    .find(candidate => ts.isIdentifier(candidate.name) && candidate.name.text === name)
  if (!declaration?.initializer || !ts.isObjectLiteralExpression(declaration.initializer)) return undefined
  // Later object properties override earlier spread values.
  for (const property of [...declaration.initializer.properties].reverse()) {
    if (ts.isPropertyAssignment(property) && property.name.getText(source) === key) {
      return ts.isStringLiteral(property.initializer) ? property.initializer.text : undefined
    }
    if (!ts.isSpreadAssignment(property) || !ts.isIdentifier(property.expression)) continue
    const spreadName = property.expression.text
    const imported = source.statements.filter(ts.isImportDeclaration).flatMap(statement => {
      const bindings = statement.importClause?.namedBindings
      if (!bindings || !ts.isNamedImports(bindings) || !ts.isStringLiteral(statement.moduleSpecifier)) return []
      const modulePath = statement.moduleSpecifier.text
      return bindings.elements.filter(element => element.name.text === spreadName).map(element => ({
        file: resolve(dirname(file), `${modulePath}.ts`),
        name: element.propertyName?.text ?? element.name.text,
      }))
    })[0]
    const value = registryString(imported?.file ?? file, imported?.name ?? spreadName, key)
    if (value !== undefined) return value
  }
  return undefined
}

describe('Cognitive onboarding hardening', () => {
  it('requires every non-baseline Cognitive seed to start DRAFT', () => {
    const seen = new Set<string>()
    for (const seed of COGNITIVE_SEEDS) {
      const identity = `${seed.testType}/${seed.configVersion}`
      expect(seen.has(identity), `duplicate Cognitive seed ${identity}`).toBe(false)
      seen.add(identity)

      if (APPROVED_PUBLISHED_SEED_BASELINE.has(identity)) {
        expect(seed.status, `${identity} is an approved historical/release-reviewed seed`).toBe('PUBLISHED')
      } else {
        expect(
          seed.status,
          `${identity} is a new/unapproved seed; onboard it as DRAFT and use explicit Product Readiness + publish review`,
        ).toBe('DRAFT')
      }
    }

    const missingBaseline = [...APPROVED_PUBLISHED_SEED_BASELINE].filter((identity) => !seen.has(identity))
    expect(missingBaseline, 'approved published seed baseline contains stale identities').toEqual([])
  })

  it('keeps every backend engine identity backed by an exact registered frontend runner', () => {
    expect(existsSync(FRONTEND_REGISTRY_PATH), FRONTEND_REGISTRY_PATH).toBe(true)
    const frontendRegistry = readFileSync(FRONTEND_REGISTRY_PATH, 'utf8')
    const engineIdentities = new Map<string, { testType: string; engineVersion: string }>()

    for (const entry of listCognitiveRegistryEntries()) {
      engineIdentities.set(`${entry.testType}/${entry.engineVersion}`, {
        testType: entry.testType,
        engineVersion: entry.engineVersion,
      })
    }

    expect(engineIdentities.size).toBeGreaterThan(0)
    for (const { testType, engineVersion } of engineIdentities.values()) {
      const taskPackage = JSON.parse(readFileSync(resolve(__dirname, '../../modules/cognitive/tasks', testType, 'task-package.json'), 'utf8'))
      const binding = taskPackage.frontend.find((entry: { testType: string; engineVersion: string }) => entry.testType === testType && entry.engineVersion === engineVersion)
      expect(binding, `missing frontend binding for ${testType}/${engineVersion}`).toBeDefined()
      const taskRegistryPath = resolve(REPOSITORY_ROOT, binding.file)
      expect(existsSync(taskRegistryPath), taskRegistryPath).toBe(true)
      const taskRegistrySource = readFileSync(taskRegistryPath, 'utf8')
      const source = ts.createSourceFile(taskRegistryPath, taskRegistrySource, ts.ScriptTarget.Latest, true)
      const declaration = source.statements.filter(ts.isVariableStatement)
        .filter(statement => statement.modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.ExportKeyword))
        .flatMap(statement => [...statement.declarationList.declarations])
        .find(declaration => ts.isIdentifier(declaration.name) && declaration.name.text === binding.export)
      expect(declaration?.initializer && ts.isObjectLiteralExpression(declaration.initializer), binding.export).toBe(true)
      const object = declaration!.initializer as ts.ObjectLiteralExpression
      const engine = object.properties.find(property => ts.isPropertyAssignment(property) && property.name.getText(source) === 'engineVersion') as ts.PropertyAssignment | undefined
      expect(engine && ts.isStringLiteral(engine.initializer) ? engine.initializer.text : undefined, `${taskRegistryPath}:${binding.export}`).toBe(engineVersion)
      expect(registryString(taskRegistryPath, binding.export, 'testType'), `${taskRegistryPath}:${binding.export}`).toBe(testType)

      const importPath = relative(resolve(FRONTEND_COGNITIVE_ROOT, 'generated'), taskRegistryPath).replace(/\\/g, '/').replace(/\.tsx?$/, '')
      const importPattern = new RegExp(`import\\s*\\{\\s*${escapeRegex(binding.export)}\\s+as\\s+(\\w+)\\s*\\}\\s*from\\s*['"]${escapeRegex(importPath)}['"]`)
      const imported = frontendRegistry.match(importPattern)
      expect(imported, `frontend root registry must import ${testType}/${engineVersion} from ${importPath}`).not.toBeNull()
      const entries = frontendRegistry.match(/export const cognitiveRunnerEntries = \[([^\]]+)\]/)?.[1].split(',').map(value => value.trim())
      expect(entries, `frontend root registry must register ${testType}/${engineVersion}`).toContain(imported![1])
    }
  })
})
