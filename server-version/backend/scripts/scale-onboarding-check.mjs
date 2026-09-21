import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

const backend = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const manifestPath = 'scripts/scale-onboarding-boundaries.json'
const manifest = JSON.parse(fs.readFileSync(path.join(backend, manifestPath), 'utf8'))
const approved = new Set(['src/modules/scale/onboarding/types.ts', 'src/modules/scale/library/catalog-manifest.ts', 'src/modules/scale/library/localization-manifest.ts', 'src/modules/scale/policy/disclosure.ts', 'src/modules/scale/instruments/catalog-defaults.ts'])

export const classifyScaleOnboardingPath = file => {
  if (/^server-version\/backend\/src\/modules\/scale\/instruments\/[^/]+\/[^/]+\//.test(file)) return 'INSTRUMENT_OWNED'
  if (file === 'server-version/backend/src/modules/scale/onboarding/instruments.generated.ts') return 'GENERATED'
  if (/^server-version\/backend\/src\/__tests__\/scale\/instruments\//.test(file)) return 'TEST'
  if (/^docs\/scale-instruments\//.test(file)) return 'DOC'
  return 'SHARED_CORE'
}

export const inspectScaleChangedPaths = (files, mode) => mode === 'platform' ? [] : files
  .filter(file => classifyScaleOnboardingPath(file) === 'SHARED_CORE')
  .map(file => `PLATFORM_CAPABILITY_REQUIRED:${file}`)

/** Content modules are declarations, not arbitrary backend programs. */
export const inspectScaleContent = (file, text, legacyImports = manifest.legacyImports) => {
  const errors = []
  const syntax = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true)
  const identityRoot = file.split('/').slice(0, 6).join('/') + '/'
  const visit = node => {
    if (ts.isImportDeclaration(node)) {
      const target = node.moduleSpecifier.text
      const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(file), target)) + '.ts'
      if (!target.startsWith('.') || (!approved.has(resolved) && !resolved.startsWith(identityRoot) && !(legacyImports[file] ?? []).includes(target))) errors.push(`IMPORT_NOT_ALLOWED:${target}`)
    }
    if (ts.isExportDeclaration(node) && node.moduleSpecifier) errors.push('REEXPORT_NOT_ALLOWED')
    if (ts.isImportEqualsDeclaration(node) || ts.isNewExpression(node) || ts.isFunctionLike(node)
      || ts.isTaggedTemplateExpression(node) || ts.isAwaitExpression(node) || ts.isThrowStatement(node) || ts.isClassDeclaration(node)
      || ts.isForStatement(node) || ts.isForOfStatement(node) || ts.isForInStatement(node) || ts.isWhileStatement(node) || ts.isDoStatement(node) || ts.isExpressionStatement(node) || ts.isElementAccessExpression(node)) errors.push('EXECUTABLE_CONTENT_NOT_ALLOWED')
    if (ts.isCallExpression(node) && !/^DISCLOSURE_PRESETS\.(FULL_REPORT|EDUCATIONAL_ONLY|SCORES|COMPLETION_ONLY|NONE)$/.test(node.expression.getText(syntax))) errors.push('CALL_NOT_ALLOWED')
    if (ts.isBinaryExpression(node) && node.operatorToken.kind >= ts.SyntaxKind.FirstAssignment && node.operatorToken.kind <= ts.SyntaxKind.LastAssignment) errors.push('ASSIGNMENT_NOT_ALLOWED')
    if (ts.isIdentifier(node) && ['process', 'global', 'globalThis', 'require', 'eval', 'Function', 'fetch', 'Date', 'Math', '__dirname', '__filename'].includes(node.text)) errors.push(`AMBIENT_CAPABILITY_NOT_ALLOWED:${node.text}`)
    ts.forEachChild(node, visit)
  }
  visit(syntax)
  return [...new Set(errors)]
}

const filesUnder = dir => fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
  const file = path.join(dir, entry.name)
  if (entry.isSymbolicLink()) throw new Error(`Symlinks are not content: ${file}`)
  return entry.isDirectory() ? filesUnder(file) : [file]
})

export const checkScaleOnboarding = ({ base, mode = 'content' } = {}) => {
  if (!['content', 'platform'].includes(mode)) throw new Error('Unknown change class')
  const errors = []
  for (const file of filesUnder(path.join(backend, 'src/modules/scale/instruments'))) {
    const rel = path.relative(backend, file).replaceAll('\\', '/')
    if (/instruments\/[^/]+\/[^/]+\//.test(rel)) {
      if (!file.endsWith('.ts') && !file.endsWith('.json') && !file.endsWith('.md')) errors.push(`CONTENT_FILE_TYPE:${rel}`)
      if (file.endsWith('.ts')) errors.push(...inspectScaleContent(rel, fs.readFileSync(file, 'utf8')).map(reason => `${rel}:${reason}`))
    }
  }
  for (const pin of manifest.immutableScorers) {
    const digest = createHash('sha256').update(fs.readFileSync(path.join(backend, pin.path))).digest('hex')
    if (digest !== pin.sha256) errors.push(`IMMUTABLE_SCORER_CHANGED:${pin.key}@${pin.version}`)
  }
  if (base) {
    const repo = execFileSync('git', ['rev-parse', '--show-toplevel'], { cwd: backend, encoding: 'utf8' }).trim()
    const changed = execFileSync('git', ['diff', '--name-only', '-z', base, 'HEAD'], { cwd: repo, encoding: 'utf8' }).split('\0').filter(Boolean)
    errors.push(...inspectScaleChangedPaths(changed, mode))
    // Published adapter history cannot be rewritten by changing its expected hash.
    let old
    try { old = JSON.parse(execFileSync('git', ['show', `${base}:server-version/backend/${manifestPath}`], { cwd: repo, encoding: 'utf8', stdio: ['ignore','pipe','ignore'] })) } catch { old = null }
    for (const pin of old?.immutableScorers ?? []) if (!manifest.immutableScorers.some(row => JSON.stringify(row) === JSON.stringify(pin))) errors.push(`IMMUTABLE_SCORER_PIN_REWRITTEN:${pin.key}@${pin.version}`)
  }
  if (errors.length) throw new Error(errors.join('\n'))
  return { mode, ok: true }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2)
    const read = name => args.find(arg => arg.startsWith(`--${name}=`))?.slice(name.length + 3)
    if (args.some(arg => !/^--(base|mode)=.+$/.test(arg))) throw new Error('Use --base=<sha> --mode=content|platform')
    console.log(JSON.stringify(checkScaleOnboarding({ base: read('base'), mode: read('mode') })))
  } catch (error) { console.error(error.message); process.exitCode = 1 }
}
