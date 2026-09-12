import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

const frontend = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const source = fs.readFileSync(path.join(frontend, 'src/App.tsx'), 'utf8')
const ast = ts.createSourceFile('App.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
const output = path.resolve(frontend, '../docs/frontend-convergence/routes.md')
const routes = []
const guards = new Set(['ProtectedRoute', 'StudentProtectedRoute', 'ScaleLibraryRoute', 'OptionalStudentRoute', 'EntryRoute', 'PublicRoute'])
function visit(node) {
  if (ts.isJsxSelfClosingElement(node) && node.tagName.getText(ast) === 'Route') {
    const attrs = node.attributes.properties
    const attribute = (name) => attrs.find((a) => ts.isJsxAttribute(a) && a.name.getText(ast) === name)?.initializer
    const routePath = attribute('path')
    if (!routePath || !ts.isStringLiteral(routePath)) throw new Error('Inventory requires an explicit route path')
    const element = attribute('element')
    const tags = []
    function collect(child) {
      if (ts.isJsxOpeningElement(child) || ts.isJsxSelfClosingElement(child)) tags.push(child.tagName.getText(ast))
      ts.forEachChild(child, collect)
    }
    if (element) collect(element)
    const guard = tags.find((t) => guards.has(t))
    let cognitive = false
    for (let parent = node.parent; parent; parent = parent.parent) {
      if (ts.isBinaryExpression(parent) && parent.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken && parent.left.getText(ast) === 'cognitiveModuleEnabled') cognitive = true
    }
    const p = routePath.text
    const page = tags.find((t) => !guards.has(t)) || '—'
    const access = guard === 'ProtectedRoute' ? (element.getText(ast).includes("['ADMIN']") ? 'ADMIN' : 'TEACHER / ADMIN')
      : guard === 'StudentProtectedRoute' ? 'STUDENT'
      : guard === 'ScaleLibraryRoute' ? 'STUDENT / TEACHER / ADMIN'
      : guard === 'OptionalStudentRoute' ? 'Optional student / guest'
      : guard === 'EntryRoute' || guard === 'PublicRoute' ? 'Guest; signed-in redirect'
      : 'Public / unguarded'
    const shell = p.startsWith('/bigscreen/') ? 'Dedicated display' : 'AppShell (outside guards)'
    const isAssessment = ['ScaleAssessment', 'QuestionnaireAssessment', 'PublicQuestionnaireAssessment', 'CognitiveRunner', 'SituationalRunner', 'CompositeAssessmentPage'].includes(page)
    const target = p.startsWith('/bigscreen') ? 'Dedicated display' : p === '*' ? 'Not-found / redirect decision'
      : isAssessment ? 'focused' : p.startsWith('/public/') || /Login|Register|Portal|PublicCheckin/.test(page) ? 'public' : 'standard'
    const owner = /Cognitive/.test(page) ? 'FE-07A/B' : /Situational/.test(page) ? 'FE-06'
      : /Composite/.test(page) ? 'FE-09' : /QuestionnaireAssessment|PublicQuestionnaire/.test(page) ? 'FE-08'
      : /ScaleAssessment|ScaleLibrary|StudentScales/.test(page) ? 'FE-03C'
      : /Result|Report/.test(page) ? 'FE-05' : /Login|Register|Portal/.test(page) || p === '*' ? 'FE-02' : 'FE-10'
    routes.push([p, page, access, cognitive ? 'Cognitive capability' : '—', shell, target, owner === 'FE-02' ? owner : `FE-02 + ${owner}`, p.startsWith('/bigscreen/') ? 'Dedicated mode retained' : 'FE-02 chrome; domain UI retained'])
  }
  ts.forEachChild(node, visit)
}
visit(ast)
if (new Set(routes.map(([p]) => p)).size !== routes.length) throw new Error('Duplicate route paths require review')
const md = `# Frontend route inventory\n\nGenerated from \`frontend/src/App.tsx\` by \`npm run inventory:product-ui\`. ${routes.length} explicit routes, including fallback. This is an inventory, not a new routing manifest or authorization source. Conditional feature registration is recorded separately from access guards. Page-level/API authorization still applies to unguarded routes. Target/owner are planning classifications; verify them during each migration.\n\n| Path | Page | Route access | Registration | Current shell | Target mode | Owner | Evidence/status |\n|---|---|---|---|---|---|---|---|\n${routes.map((r) => '| ' + r.map((v) => v.replaceAll('|', '\\|')).join(' | ') + ' |').join('\n')}\n\n## Additional boundaries\n\n- FirstLoginPasswordChange remains an inline guard flow. FE-02 preserves the original destination through reauthentication.\n- Parent ObserverSelfServe and Teacher ObserverAssign exist but are not registered in App.tsx. Do not declare a working Parent journey from component existence.\n- User roles are currently STUDENT / TEACHER / ADMIN; researcher report projection is not a new frontend login role.\n- Public Cognitive access now follows the route namespace; legacy public query parameters remain compatible but do not select the client.\n- Bundle child runners retain parent/unit identifiers; focused mode must not create a second shell or attempt.\n- BigScreen retains its dedicated presentation layout. Classroom/assignment/check-in business protocols are outside this convergence change.\n- Non-route components and legacy branches are not declared dead code by this inventory.\n`
if (process.argv.includes('--check')) {
  if (!fs.existsSync(output) || fs.readFileSync(output, 'utf8') !== md) {
    console.error('Product route inventory is stale; run npm run inventory:product-ui and review the changes.')
    process.exitCode = 1
  } else console.log(`Product route inventory matches ${routes.length} routes.`)
} else {
  fs.writeFileSync(output, md)
  console.log(`Wrote ${routes.length} routes to ${output}`)
}
