import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const backendRoot = path.resolve(scriptDir, '..')
const serverRoot = path.resolve(backendRoot, '..')
const backendTasksRoot = path.join(backendRoot, 'src/modules/cognitive/tasks')
const frontendTasksRoot = path.join(serverRoot, 'frontend/src/modules/cognitive/tasks')

const walk = (root) => fs.readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
  const full = path.join(root, entry.name)
  if (entry.isDirectory()) return entry.name === 'generated' ? [] : walk(full)
  return /\.(ts|tsx)$/.test(entry.name) ? [full] : []
})

const importsOf = (source) => [...source.matchAll(/(?:import|export)\s+(?:type\s+)?(?:[\s\S]*?\s+from\s+)?['"]([^'"]+)['"]/g)]
  .map((match) => match[1])

const issues = []
for (const filePath of walk(backendTasksRoot)) {
  const rel = path.relative(serverRoot, filePath)
  for (const specifier of importsOf(fs.readFileSync(filePath, 'utf8'))) {
    if (/frontend/i.test(specifier)) issues.push(`${rel}: backend task may not import frontend: ${specifier}`)
    if (/scientific-maturity|assessment-governance/i.test(specifier)) {
      issues.push(`${rel}: execution/task content may not import scientific governance: ${specifier}`)
    }
  }
}
for (const filePath of walk(frontendTasksRoot)) {
  const rel = path.relative(serverRoot, filePath)
  for (const specifier of importsOf(fs.readFileSync(filePath, 'utf8'))) {
    if (/backend|assessment-governance|scientific-maturity/i.test(specifier)) {
      issues.push(`${rel}: frontend task crosses execution/governance boundary: ${specifier}`)
    }
  }
}
if (issues.length) {
  console.error('Cognitive import-boundary violations:')
  for (const issue of issues) console.error(` - ${issue}`)
  process.exit(1)
}
console.log('Cognitive task import boundaries: PASS')
