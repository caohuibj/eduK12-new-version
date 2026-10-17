/**
 * Missing UI evidence only, against the already-built immutable frontend.
 * The caller verifies/loads the image and runs its unchanged nginx on loopback.
 * Explicit synthetic DTOs establish UI behavior, never real API authorization.
 * Run only in GitHub Actions. --check-fixtures is a browser-free fixture check.
 */
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'

const SOURCE = '1b388507c5eaaada29bbb3d6a0eb7bb7589ad46c'
const IMAGE = 'sha256:29abe75a707f8c88a523fcbd762f0efb6e7568ec0e0c90100d501c2ae5e28312'
const OUTPUT = 'reviewed-candidate-evidence'
const TIMEOUT = 10_000
const BUDGET = 120_000
const HOSTS = ['training.eduk12.top', 'survey.eduk12.top', 'teacher.eduk12.top']
const WIDTHS = [390, 1440]
const DATE = '2026-10-17T00:00:00Z'
const COURSE_ID = 'review-course'
const PROJECT_ID = '11111111-1111-4111-8111-111111111111'
const FORM_ID = '22222222-2222-4222-8222-222222222222'
const ATTEMPT_ID = '33333333-3333-4333-8333-333333333333'
const QUESTION = 'Synthetic shared Form date'
const teacher = { id: 'review-trainer', username: 'synthetic_trainer', nickname: 'Synthetic trainer', role: 'TEACHER', platformRole: 'SYSTEM_ADMIN', mustChangePassword: false }
const course = { id: COURSE_ID, title: 'Synthetic review course', description: 'Synthetic UI fixture only', courseCode: 'REVIEW01', creatorId: teacher.id, status: 'PUBLISHED', studentCount: 0, isLibrary: false, isRecruiting: true, createdAt: DATE, updatedAt: DATE }
const otherCourse = { ...course, id: 'review-other-course', title: 'Synthetic other course' }
const assignment = { id: 'review-assignment', courseId: COURSE_ID, course, title: 'Synthetic targeted assignment', description: 'Synthetic assignment detail', content: '<p>Synthetic assignment content</p>', questions: [], videos: [], images: [], documents: [], tags: [], deadline: null, status: 'PUBLISHED', _count: { submissions: 0 }, createdAt: DATE, updatedAt: DATE }
const checkin = { id: 'review-checkin', courseId: COURSE_ID, course, title: 'Synthetic targeted checkin', content: '<p>Synthetic checkin content</p>', videos: [], images: [], documents: [], tags: [], endTime: null, allowViewOthers: false, allowAnonymous: false, status: 'PUBLISHED', _count: { submissions: 0 }, createdAt: DATE, updatedAt: DATE }
const formDefinition = { schemaVersion: 2, pages: [{ pageKey: 'main', title: 'Synthetic shared Form page', questions: [{ itemKey: 'review_date', type: 'DATE', prompt: QUESTION, required: true, allowRefusal: false, options: [], rows: [] }] }] }
const researchForm = { id: FORM_ID, projectId: PROJECT_ID, instrumentKey: 'review_form', kind: 'FORM', title: 'Synthetic existing Form', revision: 1, status: 'DRAFT', definition: formDefinition, createdAt: DATE, updatedAt: DATE }
const project = { id: PROJECT_ID, title: 'Synthetic review study', description: 'UI-only existing Form', collectionMode: 'SINGLE_UNLINKED', status: 'DRAFT', revision: 1 }
const scaleDefinition = {
  schemaVersion: 2, respondentType: 'participant_self_report', source: { title: 'Synthetic authored fixture' },
  license: { status: 'self_authored', redistribution: 'allowed' }, display: { randomizeItems: false },
  responseSets: [{ key: 'default', options: [{ value: 'yes', label: 'Yes', score: 1 }, { value: 'no', label: 'No', score: 0 }] }],
  items: [{ itemCode: 'Q1', content: 'Synthetic scale item', type: 'single', required: true, sortOrder: 0, responseSetKey: 'default', randomizeOptions: false }],
  scoring: { scoringVersion: '2.0.0', itemRules: [{ itemCode: 'Q1', transform: { type: 'identity' } }], defaultMissingPolicy: { type: 'complete_required' }, scores: [] },
  report: { reportVersion: 'scale-report-v2', primaryScoreKeys: [], scoreOrder: [], interpretations: [], limitations: ['Synthetic UI only'], disclaimer: 'Synthetic UI only' }, referencePolicy: { type: 'none' },
}
const scales = [
  ['review-draft', 'Synthetic draft scale', 'DRAFT', 'CUSTOM_DESCRIPTIVE'],
  ['review-published', 'Synthetic published scale', 'PUBLISHED', 'CUSTOM_DESCRIPTIVE'],
  ['review-standard', 'Synthetic standard scale', 'DRAFT', 'STANDARD'],
].map(([id, name, status, instrumentClass]) => ({ id, code: id, name, status, instrumentClass, description: 'Synthetic scale fixture', visibility: 'HIDDEN', instrumentVersion: '2.0.0', estimatedTime: 1, instruction: 'Synthetic instructions', tags: [], definition: scaleDefinition, creator: teacher, source: 'owned', _count: { assessments: 0 }, createdAt: DATE, updatedAt: DATE }))
const shares = [
  { id: 'review-own-share', courseId: COURSE_ID, sharedBy: teacher.id, sharedTo: teacher.id, course, sharer: teacher, createdAt: DATE },
  { id: 'review-other-share', courseId: otherCourse.id, sharedBy: 'another-trainer', sharedTo: teacher.id, course: otherCourse, sharer: { username: 'synthetic_other' }, createdAt: DATE },
]
const teacherTask = { executionId: 'review-execution', runId: 'review-run', organizationId: 'review-school', eventId: 'review-event', eventTitle: 'Synthetic evaluation event', formId: FORM_ID, formTitle: researchForm.title, status: 'STARTED', runtimeBindingKind: 'HUITEACHER_FORM_V2', runtimeBindingRef: ATTEMPT_ID }

function fixtureReview() {
  assert.match(SOURCE, /^[a-f0-9]{40}$/)
  assert.match(IMAGE, /^sha256:[a-f0-9]{64}$/)
  assert.equal(assignment.course.creatorId, teacher.id)
  assert.equal(checkin.course.id, checkin.courseId)
  assert.equal(scales.filter(s => s.status === 'DRAFT' && s.instrumentClass !== 'STANDARD').length, 1)
  assert.equal(shares.filter(s => s.sharedBy === teacher.id).length, 1)
  assert.equal(formDefinition.pages[0].questions[0].type, 'DATE')
  assert.equal(teacherTask.runtimeBindingRef, ATTEMPT_ID)
  assert.equal(new Set(HOSTS).size, 3)
}
fixtureReview()
if (process.argv.includes('--check-fixtures')) {
  console.log('PASS: browser-free synthetic fixture invariants; no browser/app/build executed')
} else {
  await run()
}

async function run() {
  mkdirSync(`${OUTPUT}/screenshots`, { recursive: true })
  const report = {
    status: 'running', sourceSha: process.env.CANDIDATE_SOURCE_SHA || null,
    currentHead: process.env.CANDIDATE_HEAD_SHA || null, imageId: process.env.CANDIDATE_IMAGE_ID || null,
    scriptSha256: createHash('sha256').update(readFileSync(fileURLToPath(import.meta.url))).digest('hex'),
    authority: 'UI-only explicit synthetic DTOs. Real authentication/authorization and runtime evidence remain the prior official backend checks.',
    transport: 'Canonical production hosts mapped to isolated HTTP loopback; unchanged runtime nginx; no TLS/certificate/security-context overrides.',
    exclusions: ['Survey participant recovery and FINAL require HTTPS crypto.randomUUID and are not exercised here.', 'No product lifecycle, real authentication, backend permission, browser matrix, application rebuild, or deployment check is repeated.'],
    checks: [], records: [], unexpected: [], screenshots: [],
  }
  let browser, active, axe, timer
  const write = () => writeFileSync(`${OUTPUT}/browser.json`, JSON.stringify(report, null, 2) + '\n')
  const clean = value => String(value).replace(/https?:\/\/[^\s"')]+/g, raw => {
    try { const u = new URL(raw); return `${u.origin}${u.pathname}` } catch { return '[URL]' }
  }).replace(/(?:token|credential|authorization)[=:]\s*[^\s,;]+/gi, '[redacted]').slice(0, 1200)
  const check = (name, detail = {}) => report.checks.push({ scenario: active?.record.scenario, width: active?.record.width, name, status: 'passed', ...detail })
  const unexpected = (kind, detail) => report.unexpected.push({ scenario: active?.record.scenario, width: active?.record.width, kind, ...detail })
  const port = Number(process.env.CANDIDATE_ORIGIN_PORT)
  const origin = product => `http://${product}.eduk12.top:${port}`
  const envelope = (data, status = 200) => ({ status, contentType: 'application/json', body: JSON.stringify({ code: status === 200 ? 0 : status, message: status === 200 ? 'ok' : 'Synthetic denied detail', data }) })
  const keyFor = (method, path, query = '') => `${method} ${path}${query}`

  function routes() {
    const map = new Map()
    return {
      map,
      add(method, path, data, { query = '', status = 200 } = {}) {
        const key = keyFor(method, path, query)
        assert(!map.has(key), 'duplicate fixture route: ' + key)
        map.set(key, async request => envelope(typeof data === 'function' ? await data(request) : structuredClone(data), status))
      },
    }
  }
  function trainingRoutes() {
    const r = routes(), state = { user: structuredClone(teacher) }
    r.add('GET', '/api/auth/me', () => state.user)
    r.add('GET', '/api/capabilities', { cognitive: false, parentPortal: false })
    return { r, state }
  }
  function courseRoutes(r) {
    r.add('GET', `/api/courses/${COURSE_ID}`, course)
    r.add('GET', `/api/courses/${COURSE_ID}/assignments`, { list: [assignment] })
    r.add('GET', `/api/courses/${COURSE_ID}/checkins`, { list: [checkin] })
    r.add('GET', `/api/courses/${COURSE_ID}/training-assessments`, { list: [] })
  }
  async function scenario(product, width, name, r, work) {
    const ctx = await browser.newContext({ viewport: { width, height: 900 }, serviceWorkers: 'block', reducedMotion: 'reduce', locale: 'zh-CN', timezoneId: 'UTC' })
    const page = await ctx.newPage()
    page.setDefaultTimeout(TIMEOUT)
    page.setDefaultNavigationTimeout(TIMEOUT)
    const record = { scenario: name, width, status: 'running', calls: [], screenshots: [], pageErrors: [] }
    report.records.push(record)
    active = { ctx, page, record }
    const base = origin(product)
    page.on('pageerror', error => record.pageErrors.push(clean(error.message)))
    page.on('dialog', dialog => { unexpected('unexpected-dialog', { type: dialog.type() }); void dialog.dismiss() })
    page.on('response', response => {
      const u = new URL(response.url())
      if (u.origin === base && !u.pathname.startsWith('/api/') && response.status() >= 400) unexpected('static-http-error', { path: u.pathname, status: response.status() })
    })
    // No request bodies, cookie values, authorization, or arbitrary query values enter evidence.
    await ctx.route('**/*', async route => {
      const request = route.request(), u = new URL(request.url())
      if (u.origin !== base) {
        unexpected('external-request-blocked', { origin: u.origin, path: u.pathname, method: request.method() })
        return route.abort('blockedbyclient')
      }
      if (request.method() === 'GET' && u.pathname === '/reviewed-candidate-axe.js' && !u.search) return route.fulfill({ contentType: 'application/javascript', body: axe })
      if (u.pathname === '/api' || u.pathname.startsWith('/api/')) {
        const key = keyFor(request.method(), u.pathname, u.search), handler = r.map.get(key)
        const call = { method: request.method(), path: u.pathname, ...(handler && u.search ? { query: u.search } : {}) }
        record.calls.push(call)
        if (!handler) {
          unexpected('unlisted-api', { method: request.method(), path: u.pathname, queryKeys: [...u.searchParams.keys()] })
          return route.fulfill(envelope(null, 500))
        }
        try { const fixture = await handler(request); call.status = fixture.status ?? 200; return await route.fulfill(fixture) }
        catch (error) { unexpected('fixture-contract', { method: request.method(), path: u.pathname, error: clean(error.message) }); return route.fulfill(envelope(null, 500)) }
      }
      if (request.method() !== 'GET' || !['document', 'script', 'stylesheet', 'font', 'image'].includes(request.resourceType())) {
        unexpected('unlisted-resource', { method: request.method(), path: u.pathname, type: request.resourceType() })
        return route.abort('blockedbyclient')
      }
      return route.continue()
    })
    await ctx.routeWebSocket('**/*', socket => { unexpected('websocket-blocked', { origin: new URL(socket.url()).origin }); socket.close() })
    try {
      await work({ page, ctx, record, base })
      assert.deepEqual(record.pageErrors, [], `${name}: browser runtime errors`)
      assert.equal(report.unexpected.length, 0, `${name}: unexpected network/resource/fixture error`)
      record.status = 'passed'
      write()
      await ctx.close()
      active = null
    } catch (error) { record.status = 'failed'; throw error }
  }
  async function visual(page, name, scope) {
    await page.evaluate(() => document.fonts.ready)
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, 'document horizontal overflow')
    if (scope) await page.locator(scope).scrollIntoViewIfNeeded()
    if (!await page.evaluate(() => typeof window.axe !== 'undefined')) await page.addScriptTag({ url: new URL('/reviewed-candidate-axe.js', page.url()).href })
    const violations = await page.evaluate(async selector => {
      const results = await window.axe.run(selector ? document.querySelector(selector) : document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] } })
      return results.violations.map(v => ({ id: v.id, impact: v.impact, targets: v.nodes.map(n => n.target) }))
    }, scope)
    report.checks.push({ scenario: active.record.scenario, width: active.record.width, name: 'responsive and targeted WCAG audit', view: name, status: violations.length ? 'failed' : 'passed', violations })
    assert.deepEqual(violations, [], `${name}: WCAG violations`)
    const file = `screenshots/${name}-${active.record.width}.png`
    await page.screenshot({ path: `${OUTPUT}/${file}`, fullPage: false, timeout: TIMEOUT })
    report.screenshots.push(file); active.record.screenshots.push(file)
  }
  const hasCall = (record, method, path) => record.calls.some(c => c.method === method && c.path === path)
  async function noOldEditor(page, title, dialogName) {
    await page.getByRole('dialog', { name: dialogName, exact: true }).waitFor({ state: 'detached' })
    assert.equal(await page.getByRole('button', { name: title, exact: true }).count(), 0)
    assert.equal(await page.locator('input').evaluateAll((nodes, value) => nodes.some(n => [value, `Synthetic unsaved ${value}`].includes(n.value)), title), false)
  }

  async function allChecks() {
    assert.equal(process.env.GITHUB_ACTIONS, 'true', 'Browser execution is restricted to the sole official GitHub check')
    assert.equal(report.sourceSha, SOURCE)
    assert.equal(report.imageId, IMAGE)
    assert.match(report.currentHead || '', /^[a-f0-9]{40}$/)
    const checkoutSha = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
    const gitTree = ref => execFileSync('git', ['rev-parse', `${ref}^{tree}`], { encoding: 'utf8' }).trim()
    assert.equal(gitTree(checkoutSha), gitTree(report.currentHead), 'PR merge/head tree identity')
    execFileSync('git', ['merge-base', '--is-ancestor', SOURCE, report.currentHead])
    report.checkoutSha = checkoutSha
    assert.equal(port, 3189, 'only the isolated candidate loopback port is allowed')
    axe = readFileSync(new URL('../release-tools/node_modules/axe-core/axe.min.js', import.meta.url), 'utf8')
    const { chromium } = await import('../release-tools/node_modules/playwright-core/index.mjs')
    browser = await chromium.launch({ headless: true, timeout: TIMEOUT, args: ['--no-proxy-server', `--host-resolver-rules=${HOSTS.map(host => `MAP ${host} 127.0.0.1`).join(', ')}`] })
    for (const width of WIDTHS) {
      for (const [collection, item, noun] of [['assignments', assignment, '作业'], ['checkins', checkin, '打卡']]) {
        const { r, state } = trainingRoutes()
        // Course list intentionally omits this course: only direct detail may supply it.
        r.add('GET', '/api/courses', { list: [] })
        r.add('GET', `/api/${collection}/tags`, { tags: [] })
        r.add('GET', `/api/${collection}/${item.id}`, () => ({ ...item, course }), { query: `?courseId=${COURSE_ID}` })
        r.add('GET', `/api/${collection}/review-denied`, null, { query: `?courseId=${COURSE_ID}`, status: 403 })
        await scenario('training', width, `${collection}-target-and-identity`, r, async ({ page, record, base }) => {
          const original = `/${collection}?id=${item.id}&courseId=${COURSE_ID}`
          await page.goto(base + original)
          await page.getByRole('button', { name: item.title, exact: true }).waitFor()
          assert(hasCall(record, 'GET', `/api/${collection}/${item.id}`))
          assert(!record.calls.some(c => c.path === `/api/${collection}`), 'must not scan list page 1 for a deep link')
          await page.getByRole('button', { name: item.title, exact: true }).click()
          const editor = page.getByRole('dialog', { name: `编辑${noun}`, exact: true })
          await editor.waitFor()
          assert.equal(await editor.getByLabel('选择课程 *', { exact: true }).inputValue(), COURSE_ID)
          assert.equal(await editor.getByLabel(`${noun}标题 *`, { exact: true }).inputValue(), item.title)
          await editor.getByLabel(`${noun}标题 *`, { exact: true }).fill(`Synthetic unsaved ${item.title}`)
          await visual(page, `${collection}-target-editor`, '[role="dialog"]')
          // Same mounted SPA receives a real history navigation; not a reload that would hide stale state.
          await page.evaluate(path => { history.pushState(null, '', path); dispatchEvent(new PopStateEvent('popstate')) }, `/${collection}?id=review-denied&courseId=${COURSE_ID}`)
          await page.getByText(`获取${noun}列表失败`, { exact: true }).waitFor()
          assert(record.calls.some(call => call.path === `/api/${collection}/review-denied` && call.status === 403), 'denied direct request actually executed')
          await noOldEditor(page, item.title, `编辑${noun}`)
          check('target switch removes previous detail and editor; denied direct response remains visible')
          await page.goBack()
          await page.getByRole('button', { name: item.title, exact: true }).click()
          await page.getByRole('dialog', { name: `编辑${noun}`, exact: true }).waitFor()
          assert.equal(await page.getByLabel(`${noun}标题 *`, { exact: true }).inputValue(), item.title)
          await page.getByLabel(`${noun}标题 *`, { exact: true }).fill(`Synthetic unsaved ${item.title}`)
          state.user = { ...teacher, id: 'review-other-trainer', username: 'synthetic_other_trainer' }
          const me = page.waitForResponse(res => new URL(res.url()).pathname === '/api/auth/me')
          await page.evaluate(() => dispatchEvent(new Event('focus')))
          await me
          await page.getByText(`无法管理此课程的${noun}`, { exact: true }).waitFor()
          await noOldEditor(page, item.title, `编辑${noun}`)
          check('identity revalidation removes previous detail and editor; mismatched owner DTO is rejected')
          assert(!record.calls.some(c => c.path === `/api/${collection}`), 'no list fallback after route/identity changes')
        })
      }

      {
        const { r } = trainingRoutes(), mutable = structuredClone(scales)
        r.add('GET', '/api/scales', () => ({ list: mutable, total: mutable.length }), { query: '?page=1&pageSize=100' })
        r.add('GET', '/api/scales/tags', { tags: [] })
        for (const scale of mutable) r.add('GET', `/api/scales/${scale.id}`, () => scale)
        r.add('GET', '/api/auth/csrf', { csrfToken: 'synthetic-ui-csrf' })
        r.add('PUT', '/api/scales/review-draft', request => {
          const body = request.postDataJSON()
          assert.deepEqual(Object.keys(body).sort(), ['description', 'estimatedTime', 'instruction', 'name', 'tags', 'visibility'].sort())
          assert.equal(body.name, 'Synthetic saved draft scale')
          Object.assign(mutable[0], body)
          return mutable[0]
        })
        await scenario('training', width, 'scale-draft-published-standard', r, async ({ page, record, base }) => {
          await page.goto(base + '/scales')
          await page.getByRole('link', { name: '编辑 Synthetic draft scale', exact: true }).waitFor()
          for (const name of ['Synthetic published scale', 'Synthetic standard scale']) {
            assert.equal(await page.getByRole('link', { name: `编辑 ${name}`, exact: true }).count(), 0)
            await page.getByRole('link', { name: `查看 ${name}`, exact: true }).click()
            await page.getByRole('heading', { name, exact: true }).waitFor()
            assert.equal(await page.getByLabel('量表名称', { exact: true }).isDisabled(), true)
            assert.equal(await page.getByRole('button', { name: '保存草稿', exact: true }).count(), 0)
            assert.equal(await page.getByRole('button', { name: '保存基本信息', exact: true }).isDisabled(), true)
            await page.getByRole('button', { name: '题目', exact: true }).click()
            assert.equal(await page.getByRole('button', { name: '增加题目', exact: true }).isDisabled(), true)
            assert.equal(await page.getByRole('button', { name: '保存题目', exact: true }).isDisabled(), true)
            assert.equal(await page.getByPlaceholder('题目内容', { exact: true }).isDisabled(), true)
            check('published/custom or standard scale has no editable save path', { scale: name })
            await page.getByRole('link', { name: '返回量表列表', exact: true }).click()
          }
          await page.getByRole('link', { name: '编辑 Synthetic draft scale', exact: true }).click()
          await page.getByLabel('量表名称', { exact: true }).fill('Synthetic saved draft scale')
          assert.equal(await page.getByRole('button', { name: '保存草稿', exact: true }).isEnabled(), true)
          const saved = page.waitForResponse(res => res.request().method() === 'PUT' && new URL(res.url()).pathname === '/api/scales/review-draft')
          await page.getByRole('button', { name: '保存基本信息', exact: true }).click()
          assert.equal((await saved).status(), 200)
          await page.getByRole('heading', { name: 'Synthetic saved draft scale', exact: true }).waitFor()
          await page.getByRole('button', { name: '保存基本信息', exact: true }).click({ trial: true })
          assert.equal(await page.getByRole('button', { name: '保存基本信息', exact: true }).isEnabled(), true)
          assert.deepEqual(record.calls.filter(c => c.method !== 'GET').map(c => `${c.method} ${c.path}`), ['PUT /api/scales/review-draft'])
          check('draft accepts one exact synthetic metadata save; frozen scales send no mutation')
          await visual(page, 'scale-draft', '#hui-main')
        })
      }

      {
        const { r, state } = trainingRoutes()
        let visibleShares = structuredClone(shares)
        r.add('GET', '/api/courses', { list: [] })
        r.add('GET', '/api/courses/shared-to-me', () => ({ list: visibleShares }))
        r.add('GET', '/api/auth/csrf', { csrfToken: 'synthetic-ui-csrf' })
        r.add('DELETE', '/api/courses/share/review-other-share', () => {
          assert.equal(state.user.role, 'ADMIN')
          visibleShares = visibleShares.filter(share => share.id !== 'review-other-share')
          return { removed: true }
        })
        await scenario('training', width, 'course-share-sender-and-admin', r, async ({ page, record, base }) => {
          await page.goto(base + '/courses')
          await page.getByRole('button', { name: /^分享给我的/ }).click()
          await page.getByRole('heading', { name: otherCourse.title, exact: true }).waitFor()
          assert.equal(await page.getByRole('button', { name: `取消分享 ${course.title}`, exact: true }).count(), 1)
          assert.equal(await page.getByRole('button', { name: `取消分享 ${otherCourse.title}`, exact: true }).count(), 0)
          check('sharedBy allows own revoke; platformRole SYSTEM_ADMIN alone cannot revoke another share')
          state.user = { ...teacher, id: 'review-admin', role: 'ADMIN', platformRole: 'STANDARD', nickname: 'Synthetic administrator' }
          const me = page.waitForResponse(res => new URL(res.url()).pathname === '/api/auth/me')
          await page.evaluate(() => dispatchEvent(new Event('focus')))
          await me
          // Wait for the new identity commit before clicking its remounted tab.
          await page.getByText('Synthetic administrator · 旧版管理员', { exact: true }).waitFor()
          // AuthProvider remounts CourseList, including its selected tab.
          await page.getByRole('button', { name: /^分享给我的/ }).click()
          const revoke = page.getByRole('button', { name: `取消分享 ${otherCourse.title}`, exact: true })
          await revoke.waitFor()
          assert.equal(await page.getByRole('button', { name: `取消分享 ${course.title}`, exact: true }).count(), 1)
          await visual(page, 'course-share-admin', '#hui-main')
          await revoke.click()
          await page.getByRole('dialog', { name: '确认操作', exact: true }).getByRole('button', { name: '确认', exact: true }).click()
          await page.getByRole('heading', { name: otherCourse.title, exact: true }).waitFor({ state: 'detached' })
          assert(hasCall(record, 'DELETE', '/api/courses/share/review-other-share'))
          check('role ADMIN sees and can invoke the exact synthetic share-revoke action')
        })
      }

      {
        const { r } = trainingRoutes()
        r.add('GET', '/api/composite-assessments/review-composite/attempts', {
          assessment: { id: 'review-composite', name: 'Synthetic composite results', code: 'REVIEW', productKind: 'QUESTIONNAIRE', status: 'PUBLISHED', courseId: COURSE_ID },
          attemptCounts: { started: 0, inProgress: 0, completed: 0, abandoned: 0 }, list: [], page: 1, pageSize: 20, total: 0, totalPages: 0, hasMore: false,
        }, { query: '?page=1&pageSize=20' })
        courseRoutes(r)
        await scenario('training', width, 'composite-results-course-return', r, async ({ page, record, base }) => {
          await page.goto(base + `/composite-assessments/review-composite/results?courseId=${COURSE_ID}`)
          await page.getByRole('heading', { name: 'Synthetic composite results', exact: true }).waitFor()
          const back = page.getByRole('link', { name: '返回当前课程', exact: true })
          assert.equal(await back.getAttribute('href'), `/courses/${COURSE_ID}/detail`)
          await back.click()
          await page.getByRole('heading', { name: course.title, exact: true }).waitFor()
          assert.equal(new URL(page.url()).pathname, `/courses/${COURSE_ID}/detail`)
          assert(hasCall(record, 'GET', `/api/courses/${COURSE_ID}`))
          await visual(page, 'composite-course-return', '#hui-main')
          check('actual return link retains the exact originating course and renders its authorized UI fixture')
        })
      }

      {
        const r = routes(), prefix = `/api/survey/projects/${PROJECT_ID}`
        r.add('GET', '/api/survey/auth/me', { id: 'review-researcher', username: 'synthetic_researcher', mustChangePassword: false })
        r.add('GET', '/api/survey/auth/capabilities', { analytics: false, publication: true })
        r.add('GET', '/api/survey/projects', { list: [project] }, { query: '?page=1' })
        r.add('GET', prefix, project)
        r.add('GET', `${prefix}/instruments`, { list: [researchForm] }, { query: '?page=1' })
        r.add('GET', `${prefix}/instruments/${FORM_ID}`, researchForm)
        r.add('GET', `${prefix}/catalog`, { list: [] }, { query: '?page=1' })
        r.add('GET', `${prefix}/waves`, { list: [] }, { query: '?page=1' })
        r.add('GET', '/api/survey/auth/csrf', { csrfToken: 'synthetic-ui-csrf' })
        r.add('POST', `${prefix}/instruments/${FORM_ID}/validate`, request => {
          assert.deepEqual(request.postDataJSON(), {})
          return { revision: 1, ok: true, issues: [], kind: 'FORM', definitionDigest: 'a'.repeat(64) }
        })
        await scenario('survey', width, 'survey-existing-form-shared-preview', r, async ({ page, record, base }) => {
          await page.goto(base + '/workspace')
          await page.getByRole('button', { name: '查看/编辑', exact: true }).click()
          await page.getByRole('button', { name: /^Synthetic existing Form FORM/ }).click()
          assert.equal(await page.getByLabel('题干', { exact: true }).inputValue(), QUESTION)
          await page.getByRole('button', { name: '结构检查与编译预览', exact: true }).click()
          const preview = page.getByRole('region', { name: '研究工具试答预览', exact: true })
          const input = preview.getByLabel(QUESTION, { exact: true })
          await input.fill('2026-10-17')
          assert.equal(await input.inputValue(), '2026-10-17')
          assert(hasCall(record, 'POST', `${prefix}/instruments/${FORM_ID}/validate`))
          await visual(page, 'survey-shared-form-preview', '[aria-label="研究工具试答预览"]')
          check('Survey legacy ResearchPreview renders and updates shared ProfessionalFormAnswer DATE input')
        })
      }

      {
        const r = routes()
        r.add('GET', '/api/huiteacher/auth/me', { id: 'review-teacher', username: 'synthetic_teacher', role: 'TEACHER', product: 'HUITEACHER', mustChangePassword: false, organizations: [] })
        // Exact independently-mounted workspace widgets; no catch-all list response.
        for (const path of ['/personal-scale/catalog', '/personal-scale/assessments', '/my-scale-tasks', '/my-student-feedback', '/my-improvement-targets']) r.add('GET', `/api/huiteacher${path}`, { list: [] })
        r.add('GET', '/api/huiteacher/my-form-tasks', { list: [teacherTask] })
        r.add('GET', `/api/huiteacher/form-attempts/${ATTEMPT_ID}/task`, { attemptId: ATTEMPT_ID, formId: FORM_ID, status: 'STARTED', title: researchForm.title, definitionDigest: 'b'.repeat(64), reportMode: 'COMPLETION_ONLY', pages: formDefinition.pages })
        await scenario('teacher', width, 'teacher-existing-form-shared-runner', r, async ({ page, record, base }) => {
          await page.goto(base + '/')
          const tasks = page.getByRole('region', { name: '我的教师发展评价任务', exact: true })
          await tasks.getByRole('button', { name: '继续评价', exact: true }).click()
          const input = tasks.getByLabel(QUESTION, { exact: true })
          await input.fill('2026-10-17')
          assert.equal(await input.inputValue(), '2026-10-17')
          assert(hasCall(record, 'GET', `/api/huiteacher/form-attempts/${ATTEMPT_ID}/task`))
          assert(!record.calls.some(c => c.method !== 'GET'), 'old Form smoke must not start or finalize a lifecycle')
          await visual(page, 'teacher-shared-form-runner', '[aria-label="我的教师发展评价任务"]')
          check('Teacher legacy TaskForm renders and updates the same shared ProfessionalFormAnswer DATE input')
        })
      }
    }
    assert.equal(report.records.length, WIDTHS.length * 7)
    assert(report.records.every(record => record.status === 'passed'))
    assert.deepEqual(report.unexpected, [])
  }

  try {
    await Promise.race([allChecks(), new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('120-second candidate browser budget exceeded')), BUDGET) })])
    report.status = 'success'
  } catch (error) {
    report.status = 'failed'
    report.failure = { scenario: active?.record.scenario || 'initialization', width: active?.record.width || null, error: clean(error.message || error) }
    if (active) {
      active.record.status = 'failed'
      if (!active.page.isClosed()) {
        const file = `screenshots/failure-${active.record.scenario}-${active.record.width}.png`
        try { await active.page.screenshot({ path: `${OUTPUT}/${file}`, fullPage: false, timeout: TIMEOUT }); report.screenshots.push(file); active.record.screenshots.push(file) } catch { /* Partial JSON still survives screenshot failure. */ }
      }
    }
    process.exitCode = 1
  } finally {
    clearTimeout(timer)
    write()
    if (browser) await browser.close()
  }
  console.log(JSON.stringify({ status: report.status, report: `${OUTPUT}/browser.json`, scenarios: report.records.length, unexpected: report.unexpected.length }))
}
