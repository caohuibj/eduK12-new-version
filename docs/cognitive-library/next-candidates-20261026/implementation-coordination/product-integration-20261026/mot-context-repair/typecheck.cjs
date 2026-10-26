const path = require('node:path')
const ts = require(path.join(process.cwd(), 'node_modules/typescript'))
const config = ts.readConfigFile('tsconfig.app.json', ts.sys.readFile)
if (config.error) throw Error('Actual frontend tsconfig unreadable')
const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, process.cwd())
const roots = ['src/modules/cognitive/tasks/mot/MotTask.tsx',
  'src/modules/cognitive/tasks/mot/context-retention.ts', 'src/modules/cognitive/tasks/mot/MotTask.context.test.tsx']
const program = ts.createProgram(roots, parsed.options)
const diagnostics = ts.getPreEmitDiagnostics(program)
if (diagnostics.length) {
  process.stdout.write(ts.formatDiagnosticsWithColorAndContext(diagnostics, {
    getCanonicalFileName: f => f, getCurrentDirectory: () => process.cwd(), getNewLine: () => '\n',
  }))
  process.exitCode = 1
} else process.stdout.write('MOT C-02 actual tsconfig changed-entry closure: PASS (3 roots, noEmit)\n')
