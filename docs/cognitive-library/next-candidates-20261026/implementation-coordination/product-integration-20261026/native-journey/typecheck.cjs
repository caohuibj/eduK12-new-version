const path = require('node:path')
const ts = require(path.join(process.cwd(), 'node_modules/typescript'))
const config = ts.readConfigFile('tsconfig.json', ts.sys.readFile)
if (config.error) throw Error('backend tsconfig unreadable')
const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, process.cwd())
// noEmit; widen only rootDir so the real Prisma seed and its direct tests can be checked together.
const options = { ...parsed.options, rootDir: process.cwd(), noEmit: true }
const roots = ['src/middleware/auth.ts', 'src/modules/cognitive/task-resource.ts', 'src/modules/cognitive/catalog.service.ts',
 'src/modules/cognitive/library/product-readiness.ts', 'src/modules/cognitive/profile-freeze.ts',
 'src/modules/cognitive/assignment.service.ts', 'src/modules/cognitive/assignment-measurement-release.ts',
 'src/modules/cognitive/session.service.ts', 'src/modules/cognitive/public.service.ts', 'src/modules/cognitive/release.service.ts',
 'prisma/seeds/native-cognitive.ts', 'prisma/seeds/cognitive.ts',
 'src/__tests__/cognitive/native-mot-journey.postgres.integration.test.ts', 'src/__tests__/cognitive/native-task-resource.test.ts']
const program = ts.createProgram(roots, options), diagnostics = ts.getPreEmitDiagnostics(program)
if (diagnostics.length) { process.stdout.write(ts.formatDiagnosticsWithColorAndContext(diagnostics, {
 getCanonicalFileName: f => f, getCurrentDirectory: () => process.cwd(), getNewLine: () => '\n' })); process.exitCode = 1 }
else process.stdout.write('Native MOT changed-entry closure PASS: 14 roots, actual backend tsconfig plus noEmit/rootDir for Prisma seed\n')
