/** Selected source contract check, not publication/scientific/rights approval.
 * CLI binds the complete base -> actual checkout (including merge-preview) diff.
 * No registry enumeration, database, browser or generator execution occurs here.
 */
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { dirname, posix, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import ts from 'typescript'
import { inspectScaleContent } from './scale-onboarding-check.mjs'
import { inspectSelectedScaleImports } from '../../../.github/scripts/declarative-content.mjs'
import { parseScaleInstrumentSourceSchema } from '../src/modules/scale/onboarding/schema'
import { validateScaleInstrumentSource } from '../src/modules/scale/onboarding/validate-instrument'
import { hashScaleDefinition, isScaleContentItem } from '../src/modules/scale/scale-definition'
import { canonicalHash } from '../src/modules/assessment-runtime/canonical'
import { referenceSetHash } from '../src/modules/assessment-runtime/reference-binding'
import { snapshotScaleInstrumentSource } from '../src/modules/scale/onboarding/source-snapshot'
import { buildScaleResult, parseScaleResultV2, type ScaleResultV2 } from '../src/modules/scale/scale-result'
import type { ScaleInstrumentSourceV1 } from '../src/modules/scale/onboarding/types'
import type { ScaleAnswer } from '../src/modules/scale/scale-scoring'

const prefix = 'server-version/backend/'
const sourcePattern = /^server-version\/backend\/src\/modules\/scale\/instruments\/([a-z][a-z0-9_]*)\/(\d+\.\d+\.\d+)\/instrument\.ts$/
const backend = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const repo = resolve(backend, '../..')
const git = (args: string[], cwd = repo) => execFileSync('git', args, { cwd, encoding: 'utf8' })

/** Existing AST content guard plus the bounded import surface of this lane.
 * Inline declarations and the existing source.json wrapper are both supported.
 * Nothing supplied by a candidate is executed before its AST/imports are checked.
 */
export async function readSelectedSource(file: string, read: (file: string) => string): Promise<ScaleInstrumentSourceV1> {
  assert.match(file, sourcePattern)
  const text = read(file)
  assert.deepEqual(inspectScaleContent(file.slice(prefix.length), text), [], `UNSAFE_DECLARATION:${file}`)
  const tree = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true)
  const { jsonBinding } = inspectSelectedScaleImports(ts, tree, file)
  // Transpile only after the existing guard; imports are restricted above. A
  // data module lets historical source use its historical JSON, not HEAD's JSON.
  const moduleText = ts.transpileModule(text, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText
  const executable = jsonBinding
    ? moduleText.replace(/^import\s+\w+\s+from\s+['"]\.\/source\.json['"];?\s*$/m,
      `const ${jsonBinding} = ${JSON.stringify(JSON.parse(read(file.replace(/instrument\.ts$/, 'source.json'))))};`)
    : moduleText
  assert.ok(!/^import\s/m.test(executable), `UNSUPPORTED_RUNTIME_IMPORT:${file}`)
  const mod = await import(`data:text/javascript;base64,${Buffer.from(executable).toString('base64')}`)
  const source = parseScaleInstrumentSourceSchema(mod.SCALE_INSTRUMENT_SOURCE)
  const match = sourcePattern.exec(file)!
  assert.equal(source.identity.instrumentKey, match[1], `IDENTITY_PATH:${file}`)
  assert.equal(source.identity.instrumentVersion, match[2], `VERSION_PATH:${file}`)
  return source
}

const newer = (next: string, old: string) => {
  const x = next.split('.').map(Number), y = old.split('.').map(Number)
  return x.some((n, i) => n > y[i] && x.slice(0, i).every((v, j) => v === y[j]))
}

/** Same-identity history mirrors the pure checks in axis-snapshots.ts and
 * install/materialize. Those contracts have no DRAFT measurement exemption.
 * This is repository history, not proof of what has been installed in a DB.
 */
export function checkSelectedHistory(previous: ScaleInstrumentSourceV1, next: ScaleInstrumentSourceV1) {
  assert.deepEqual(next.identity, previous.identity, 'HISTORICAL_IDENTITY_CHANGED')
  if (!previous.executable) return // catalog-only may acquire its first executable definition
  assert.ok(next.executable, 'EXISTING_EXECUTABLE_REMOVED')
  const old = previous.executable.definition, current = next.executable.definition
  assert.equal(hashScaleDefinition(current), hashScaleDefinition(old), 'MEASUREMENT_CHANGED_WITHOUT_NEW_C_VERSION')
  if (canonicalHash(old) !== canonicalHash(current)) {
    assert.ok(old.versionAxes && current.versionAxes, 'LEGACY_DEFINITION_VERSION_CONFLICT')
    const stripped = ({ report, referencePolicy, ...measurement }: typeof old) => measurement
    assert.equal(canonicalHash(stripped(old)), canonicalHash(stripped(current)), 'DEFINITION_VERSION_CONFLICT')
    if (canonicalHash(old.report) !== canonicalHash(current.report)) {
      assert.ok(newer(current.report.reportVersion, old.report.reportVersion), 'REPORT_VERSION_CONFLICT')
    }
    if (canonicalHash(old.referencePolicy) !== canonicalHash(current.referencePolicy)) {
      assert.ok(old.referencePolicy.type === 'declared' && current.referencePolicy.type === 'declared', 'REFERENCE_POLICY_VERSION_CONFLICT')
      const oldVersions = new Set(old.referencePolicy.selections.map(row => row.referenceVersion))
      const previousSelections = new Map(old.referencePolicy.selections.map(row => [row.scoreKey + ':' + row.referenceKind, row]))
      let revised = false
      for (const row of current.referencePolicy.selections) {
        const prior = previousSelections.get(row.scoreKey + ':' + row.referenceKind)
        if (prior && canonicalHash(prior) === canonicalHash(row)) continue
        assert.ok(!oldVersions.has(row.referenceVersion), 'REFERENCE_BINDING_VERSION_CONFLICT')
        revised = true
      }
      assert.ok(revised, 'REFERENCE_BINDING_REVISION_REQUIRED')
    }
  }
  for (const reference of previous.executable.references) {
    const currentReference: (typeof next.executable.references)[number] | undefined = next.executable.references.find(row => row.referenceVersion === reference.referenceVersion)
    // Same reference version must never be silently assigned different payload.
    if (currentReference) assert.equal(canonicalHash(currentReference), canonicalHash(reference), 'REFERENCE_VERSION_CONTENT_CONFLICT')
  }
  // Mirror freezeScaleAxisSnapshot's existing identity and normalization, without
  // importing its Prisma-backed persistence. Legacy definitions do not freeze
  // these axes; external README/docs are not part of a source snapshot.
  if (old.versionAxes && current.versionAxes) {
    const frozen = (source: ScaleInstrumentSourceV1) => {
      const e = source.executable!, d = e.definition
      assert.ok(source.localization, 'VERSIONED_SOURCE_LOCALIZATION_REQUIRED')
      const axes = {
        instrumentVersion: source.identity.instrumentVersion,
        measurementHash: hashScaleDefinition(d),
        scoringVersion: d.scoring.scoringVersion,
        reportVersion: d.report.reportVersion,
        referenceVersions: e.references.map(reference => ({ version: reference.referenceVersion, hash: referenceSetHash(reference) })),
        localizationVersion: source.localization.localizationVersion,
        catalogManifestVersion: source.catalog.catalogManifestVersion,
        ...(source.instruction ? { instructionVersion: source.instruction.version } : {}),
      }
      const snapshot = snapshotScaleInstrumentSource({ ...source, executable: { ...e, scorerPlugins: e.scorerPlugins ?? [] } })
      return { axisHash: canonicalHash(axes), sourceHash: canonicalHash(snapshot) }
    }
    const before = frozen(previous), after = frozen(next)
    if (before.axisHash === after.axisHash) assert.equal(after.sourceHash, before.sourceHash, 'SCALE_AXIS_VERSION_CONTENT_CONFLICT')
  }
}

export function checkSelectedSource(source: ScaleInstrumentSourceV1) {
  const validation = validateScaleInstrumentSource(source, { executeGoldenCases: false })
  assert.equal(validation.valid, true, JSON.stringify(validation.issues))
  if (!source.executable) {
    assert.equal(source.candidatePreview?.status, 'CATALOG_ONLY')
    return { ...source.identity, status: 'CATALOG_ONLY', administrable: false, goldenCases: 0, scoringExecutions: 0, issues: validation.issues }
  }
  const executable = source.executable, definition = executable.definition
  assert.ok(!definition.scoring.scorerKey && !(executable.scorerPlugins?.length), 'CUSTOM_SCORER_REQUIRES_PLATFORM_ROUTE')
  const cache = new Map<string, ScaleResultV2>()
  const run = (answers: ScaleAnswer[]) => {
    const key = canonicalHash(answers)
    if (cache.has(key)) return cache.get(key)!
    // buildScaleResult performs scoring once; reuse it for golden and report
    // assertions instead of running validator/package/readiness scorers again.
    const result = parseScaleResultV2(buildScaleResult({ scaleId: 'selected-content-check', instrumentKey: source.identity.instrumentKey,
      instrumentVersion: source.identity.instrumentVersion, name: source.catalog.identity.canonicalName,
      definition, answers, referenceSets: executable.references }))
    assert.equal(result.method.definitionHash, hashScaleDefinition(definition))
    assert.equal(result.method.scoringVersion, definition.scoring.scoringVersion)
    assert.equal(result.method.reportVersion, definition.report.reportVersion)
    assert.deepEqual(result.scores.map(score => score.key), definition.scoring.scores.map(score => score.key))
    if (result.quality.status === 'invalid') {
      assert.deepEqual(result.interpretations, [], 'INVALID_MUST_NOT_INTERPRET')
      assert.deepEqual(result.references, [], 'INVALID_MUST_NOT_REFERENCE')
    } else {
      const expected = definition.report.scoreOrder.filter(key => definition.report.interpretations.some(row => row.scoreKey === key)
        && result.scores.some(score => score.key === key && score.value !== null && score.status !== 'not_calculable'))
      assert.deepEqual(result.interpretations.map(row => row.scoreKey), expected, 'REPORT_SCORE_COVERAGE')
    }
    if (definition.referencePolicy.type === 'none') {
      assert.deepEqual(result.references, [], 'NONE_IS_VALID_WITHOUT_NORMS')
      assert.deepEqual(result.method.referenceVersions, [])
      assert.ok(result.interpretations.every(row => row.referenceVersion === null && row.label === null))
    }
    cache.set(key, result)
    return result
  }
  for (const fixture of executable.goldenCases) {
    const result = run(fixture.answers)
    assert.equal(result.quality.status, fixture.expected.quality, fixture.name + ':quality')
    assert.deepEqual(result.scores.map(score => score.key), fixture.expected.totalScoreKeys, fixture.name + ':keys')
    for (const [key, expected] of Object.entries(fixture.expected.scores)) {
      assert.equal(result.scores.find(score => score.key === key)?.value, expected, fixture.name + ':' + key)
    }
  }
  const complete = definition.items.filter(isScaleContentItem).map(item => {
    const set = definition.responseSets.find(set => set.key === item.responseSetKey)
    assert.ok(set?.options.length, 'ITEM_RESPONSE_SET_REQUIRED:' + item.itemCode)
    return { itemCode: item.itemCode, responseValue: set.options[0].value }
  })
  run(complete)
  run([])
  // Every item-based score (not just a canonical total), its own policy override,
  // and both sides of each proration threshold; composites are consumed too.
  for (const score of definition.scoring.scores) {
    if (score.source.type !== 'items') continue
    const items = score.source.items.map(row => row.itemCode)
    const policy = score.missingPolicy ?? definition.scoring.defaultMissingPolicy
    const counts = new Set([0, items.length - 1, ...(policy.type === 'prorate_if_min_answered' ? [policy.minimumAnswered - 1, policy.minimumAnswered] : [])])
    for (const count of counts) {
      if (count < 0 || count >= items.length) continue
      const omitted = new Set(items.slice(count))
      const result = run(complete.filter(answer => !omitted.has(answer.itemCode)))
      const actual = result.scores.find(row => row.key === score.key)!
      const unavailable = count === 0 || policy.type === 'complete_required' || policy.type === 'source_defined'
        || (policy.type === 'prorate_if_min_answered' && count < policy.minimumAnswered)
      assert.equal(actual.status, unavailable ? 'not_calculable' : 'limited', `${score.key}:missing:${count}`)
      if (unavailable) assert.equal(actual.value, null, `${score.key}:missing-must-not-zero`)
      else assert.ok(actual.value !== null && Number.isFinite(actual.value), `${score.key}:partial-finite`)
      assert.equal(actual.prorated, !unavailable && policy.type === 'prorate_if_min_answered')
    }
  }
  return { ...source.identity, status: executable.releaseStatus, administrationEligibility: 'not-evaluated',
    goldenCases: executable.goldenCases.length, scoringExecutions: cache.size,
    referencePolicy: definition.referencePolicy.type, issues: validation.issues }
}

/** Static reverse dependencies in the existing generated declarative manifest.
 * Deliberately does not import bundle bootstrap or any cognitive/SJT registry.
 */
export function checkSelectedBundleDependencies(sources: ScaleInstrumentSourceV1[], packages: unknown) {
  assert.ok(Array.isArray(packages), 'BUNDLE_MANIFEST_NOT_ARRAY')
  const checked: string[] = []
  for (const pack of packages) {
    for (const slot of pack.manifest.definition.slots) {
      if (slot.unitType !== 'SCALE') continue
      const source = sources.find(source => source.identity.instrumentKey === slot.instrumentKey && source.identity.instrumentVersion === slot.instrumentVersion)
      if (!source) continue
      assert.ok(source.executable, `BUNDLE_SCALE_NOT_EXECUTABLE:${slot.slotKey}`)
      const keys = new Set(source.executable.definition.scoring.scores.map(score => score.key))
      for (const selector of slot.valueSelectors ?? []) assert.ok(keys.has(selector), `BUNDLE_SCALE_SELECTOR:${slot.slotKey}:${selector}`)
      for (const mapping of pack.evidence.filter((row: { slotKey: string }) => row.slotKey === slot.slotKey)) {
        assert.ok(keys.has(mapping.selector) && mapping.valueType === 'number' && mapping.unit === 'points', `BUNDLE_SCALE_SELECTOR_TYPE_UNIT:${mapping.evidenceKey}`)
      }
      checked.push(`${pack.manifest.definition.bundleKey}@${pack.manifest.definition.bundleVersion}:${slot.slotKey}`)
    }
  }
  return checked
}

/** Static built-in slot extraction only: no bundle/engine module is imported.
 * Handles literal slots, local factories and imported literal identity objects
 * by following their explicit properties in exact-head text, never evaluating TS.
 * Unresolved slot shapes fail closed to the broader content lane.
 */
export function checkSelectedBuiltinDependencies(sources: ScaleInstrumentSourceV1[], files: Record<string, string>, read: (file: string) => string | undefined = file => files[file]) {
  const checked: string[] = []
  if (!sources.length) return checked
  const importedTrees = new Map<string, ts.SourceFile>()
  for (const [file, text] of Object.entries(files)) {
    const tree = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true)
    const nodes: ts.Node[] = []
    const collect = (node: ts.Node) => { nodes.push(node); ts.forEachChild(node, collect) }
    collect(tree)
    const property = (object: ts.ObjectLiteralExpression, name: string) => {
      const matches = object.properties.filter(p => p.name && (ts.isIdentifier(p.name) || ts.isStringLiteral(p.name)) && p.name.text === name)
      assert.ok(matches.length <= 1, `BUILTIN_SLOT_AMBIGUOUS:${file}:${name}`)
      const prop = matches[0]
      return prop && ts.isPropertyAssignment(prop) ? prop.initializer : undefined
    }
    const unresolved = (detail: string): never => { throw new Error(`BUILTIN_SCALE_STATIC_UNRESOLVED_USE_BROADER_CONTENT_LANE:${file}:${detail}`) }
    const unwrap = (value: ts.Expression): ts.Expression => ts.isAsExpression(value) || ts.isSatisfiesExpression(value) || ts.isParenthesizedExpression(value)
      ? unwrap(value.expression) : value
    const importedProperty = (value: ts.PropertyAccessExpression) => {
      if (!ts.isIdentifier(value.expression)) return unresolved('constant-property')
      const localName = value.expression.text
      // A shadowed import is not evidence for the slot's identity.
      if (nodes.some(node => (ts.isVariableDeclaration(node) || ts.isParameter(node)) && ts.isIdentifier(node.name) && node.name.text === localName)) unresolved('constant-shadow')
      const imports = tree.statements.filter(ts.isImportDeclaration).flatMap(statement => {
        const bindings = statement.importClause?.namedBindings
        if (statement.importClause?.isTypeOnly || !bindings || !ts.isNamedImports(bindings) || !ts.isStringLiteral(statement.moduleSpecifier)) return []
        return bindings.elements.filter(binding => !binding.isTypeOnly && binding.name.text === localName)
          .map(binding => ({ module: (statement.moduleSpecifier as ts.StringLiteral).text, name: (binding.propertyName ?? binding.name).text }))
      })
      if (imports.length !== 1 || !imports[0].module.startsWith('.')) return unresolved('constant-import')
      const moduleFile = posix.normalize(posix.join(posix.dirname(file), imports[0].module + '.ts'))
      if (!importedTrees.has(moduleFile)) {
        let text: string | undefined
        try { text = read(moduleFile) } catch { return unresolved('constant-source') }
        if (typeof text !== 'string') return unresolved('constant-source')
        importedTrees.set(moduleFile, ts.createSourceFile(moduleFile, text, ts.ScriptTarget.Latest, true))
      }
      const declarations = importedTrees.get(moduleFile)!.statements.filter(ts.isVariableStatement)
        .filter(statement => (statement.declarationList.flags & ts.NodeFlags.Const) && statement.modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.ExportKeyword))
        .flatMap(statement => statement.declarationList.declarations)
        .filter(declaration => ts.isIdentifier(declaration.name) && declaration.name.text === imports[0].name)
      if (declarations.length !== 1 || !declarations[0].initializer) return unresolved('constant-declaration')
      const object = unwrap(declarations[0].initializer!)
      if (!ts.isObjectLiteralExpression(object) || object.properties.some(ts.isSpreadAssignment)) return unresolved('constant-object')
      return property(object, value.name.text)
    }
    for (const node of nodes) {
      if (!ts.isPropertyAssignment(node) || !(ts.isIdentifier(node.name) || ts.isStringLiteral(node.name)) || node.name.text !== 'slots') continue
      if (!ts.isArrayLiteralExpression(node.initializer)) unresolved('slots-array')
      for (const element of (node.initializer as ts.ArrayLiteralExpression).elements) {
        if (!ts.isObjectLiteralExpression(element)) unresolved('slot-object')
        const slot = element as ts.ObjectLiteralExpression
        const unit = property(slot, 'unitType')
        if (!unit || !ts.isStringLiteral(unit)) unresolved('unitType')
        if ((unit as ts.StringLiteral).text !== 'SCALE') continue
        if (slot.properties.some(p => ts.isSpreadAssignment(p))) unresolved('slot-spread')
        const key = property(slot, 'instrumentKey'), version = property(slot, 'instrumentVersion'), selectors = property(slot, 'valueSelectors')
        let parent: ts.Node | undefined = slot.parent
        while (parent && !ts.isArrowFunction(parent) && !ts.isFunctionDeclaration(parent) && !ts.isFunctionExpression(parent)) parent = parent.parent
        const factory = parent as ts.ArrowFunction | ts.FunctionDeclaration | ts.FunctionExpression | undefined
        const parameterProperty = (value: ts.Expression | undefined) => !!value && ts.isPropertyAccessExpression(value) && ts.isIdentifier(value.expression)
          && !!factory?.parameters.some(parameter => ts.isIdentifier(parameter.name) && parameter.name.text === (value.expression as ts.Identifier).text)
        type Context = { parameter?: string; argument?: ts.ObjectLiteralExpression }
        const factoryContexts = (): Context[] => {
          if (!factory || factory.parameters.length !== 1 || !ts.isIdentifier(factory.parameters[0].name)) return unresolved('factory-shape')
          const name = ts.isFunctionDeclaration(factory) ? factory.name?.text
            : ts.isArrowFunction(factory) && ts.isVariableDeclaration(factory.parent) && ts.isIdentifier(factory.parent.name) ? factory.parent.name.text : undefined
          if (!name) return unresolved('factory-shape')
          const calls = nodes.filter(n => ts.isCallExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === name) as ts.CallExpression[]
          if (!calls.length) unresolved('factory-calls')
          return calls.map(call => {
            if (call.arguments.length !== 1 || !ts.isObjectLiteralExpression(call.arguments[0])) unresolved('factory-argument')
            return { parameter: (factory.parameters[0].name as ts.Identifier).text, argument: call.arguments[0] as ts.ObjectLiteralExpression }
          })
        }
        // Imported identities are independent of reporter/factory parameters.
        // Resolve identity before requiring selectors or calls for unrelated tools.
        const contexts: Context[] = [key, version].some(parameterProperty) ? factoryContexts() : [{}]
        for (const context of contexts) {
          const resolveValue = (value: ts.Expression | undefined, activeContext: Context = context) => {
            if (value && ts.isPropertyAccessExpression(value)) {
              if (!parameterProperty(value)) return importedProperty(value)
              if (!activeContext.argument || !ts.isIdentifier(value.expression) || value.expression.text !== activeContext.parameter) unresolved('factory-property')
              if (activeContext.argument!.properties.some(p => ts.isSpreadAssignment(p))) unresolved('argument-spread')
              return property(activeContext.argument!, value.name.text)
            }
            return value
          }
          const actualKey = resolveValue(key), actualVersion = resolveValue(version)
          if (!actualKey || !ts.isStringLiteral(actualKey) || !actualVersion || !ts.isStringLiteral(actualVersion)) unresolved('exact-identity')
          const source = sources.find(source => source.identity.instrumentKey === (actualKey as ts.StringLiteral).text && source.identity.instrumentVersion === (actualVersion as ts.StringLiteral).text)
          if (!source) continue
          assert.ok(source.executable, `BUILTIN_SCALE_NOT_EXECUTABLE:${file}:${source.identity.instrumentKey}`)
          const selectorContexts = parameterProperty(selectors) && !context.argument ? factoryContexts() : [context]
          for (const selectorContext of selectorContexts) {
            const values = resolveValue(selectors, selectorContext)
            if (!values || !ts.isArrayLiteralExpression(values) || values.elements.some(value => !ts.isStringLiteral(value))) unresolved('valueSelectors')
            const keys = new Set(source.executable.definition.scoring.scores.map(score => score.key))
            for (const value of (values as ts.ArrayLiteralExpression).elements) assert.ok(keys.has((value as ts.StringLiteral).text), `BUILTIN_SCALE_SELECTOR:${file}:${(value as ts.StringLiteral).text}`)
            checked.push(`${file}:${source.identity.instrumentKey}@${source.identity.instrumentVersion}`)
          }
        }
      }
    }
  }
  return checked
}

export async function main() {
  const base = process.env.SCALE_INTAKE_BASE_SHA ?? '', head = process.env.SCALE_INTAKE_HEAD_SHA ?? ''
  assert.match(base, /^[0-9a-f]{40}$/)
  assert.match(head, /^[0-9a-f]{40}$/)
  assert.equal(git(['rev-parse', 'HEAD']).trim(), head, 'CHECKOUT_HEAD_MISMATCH')
  const { readScaleIntakeDiff } = await import(pathToFileURL(resolve(repo, '.github/scripts/scale-intake-scope.mjs')).href)
  const selection = readScaleIntakeDiff(base, head, { cwd: repo })
  assert.ok(selection?.sources.length, 'NO_SELECTED_SOURCES')
  const results = []
  const sources: ScaleInstrumentSourceV1[] = []
  for (const file of selection.sources as string[]) {
    // Read exact Git blobs, not an untracked or modified working copy.
    const source = await readSelectedSource(file, path => git(['show', `${head}:${path}`]))
    const exists = execFileSync('git', ['ls-tree', '--name-only', base, '--', file], { cwd: repo, encoding: 'utf8' }).trim()
    if (exists) checkSelectedHistory(await readSelectedSource(file, path => git(['show', `${base}:${path}`])), source)
    results.push(checkSelectedSource(source))
    sources.push(source)
  }
  const bundleDependencies = checkSelectedBundleDependencies(sources, JSON.parse(git(['show', `${head}:server-version/backend/src/modules/assessment-bundle/generated/packages.json`])))
  const builtinPaths = git(['ls-tree', '-r', '--name-only', head, '--', 'server-version/backend/src/modules/assessment-bundle/bundles']).trim().split('\n').filter(path => path.endsWith('.ts'))
  const builtinDependencies = checkSelectedBuiltinDependencies(sources, Object.fromEntries(builtinPaths.map(path => [path, git(['show', `${head}:${path}`])])), path => git(['show', `${head}:${path}`]))
  console.log(JSON.stringify({ builtinDependencies, bundleDependencies, status: 'SCALE_INTAKE_SELECTED_PASSED', base, head, checked: results.length, results,
    boundary: 'content-contract-only; generator checked separately; no scientific, copyright, publication or deployment approval' }))
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(error); process.exitCode = 1 })
}
