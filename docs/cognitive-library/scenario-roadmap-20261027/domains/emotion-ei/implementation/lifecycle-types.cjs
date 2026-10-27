const fs = require('fs'), path = require('path'), crypto = require('crypto')
const root = path.resolve(__dirname, '../../../../../..'), cwd = path.join(root, 'server-version/frontend')
const ts = require(path.join(root, 'server-version/backend/node_modules/typescript'))
const configPath = path.join(cwd, 'tsconfig.app.json'), read = ts.readConfigFile(configPath, ts.sys.readFile)
const parsed = ts.parseJsonConfigFileContent(read.config, ts.sys, cwd)
const roots = ['src/modules/cognitive/tasks/voice-emotion-cues/lifecycle.test.tsx', 'src/vite-env.d.ts', 'src/test/setup.ts']
const program = ts.createProgram(roots.map(p => path.join(cwd, p)), { ...parsed.options, noEmit: true, incremental: false, composite: false })
const diagnostics = ts.getPreEmitDiagnostics(program).map(d => ({ path: d.file ? path.relative(root, d.file.fileName) : null, line: d.file && d.start !== undefined ? d.file.getLineAndCharacterOfPosition(d.start).line + 1 : null, code: d.code, message: ts.flattenDiagnosticMessageText(d.messageText, '\n') }))
const inputs = program.getSourceFiles().filter(f => f.fileName.startsWith(root) && !f.fileName.includes('/node_modules/')).map(f => ({ path: path.relative(root, f.fileName), sha256: crypto.createHash('sha256').update(fs.readFileSync(f.fileName)).digest('hex') }))
console.log(JSON.stringify({ kind: 'LIFECYCLE_TARGET_TYPES_ONLY', typescript: ts.version, roots, diagnostics, sourceInputs: inputs }, null, 2))
process.exitCode = diagnostics.length ? 1 : 0
