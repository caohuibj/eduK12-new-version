// MEDIA-2 real-browser acceptance.
//
// Runs inside the repository browser CI after the regular seeded Situational
// acceptance has started PostgreSQL, Redis, backend and frontend.  It seeds a
// disposable image-enhanced Scale plus a two-unit Composite (Form -> Scale),
// then exercises standalone/authenticated/public paths without adding product
// runtime or persistence behavior.

const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')
const { chromium } = require('../backend/node_modules/playwright-core')
const { PrismaClient } = require('../backend/node_modules/@prisma/client')
const {
  createCustomScaleDefinition,
  hashScaleDefinition,
} = require('../backend/dist/modules/scale/scale-definition')
const { createAccessToken } = require('../backend/dist/services/anonymousAccess')
const {
  encryptPublicAccessToken,
  hashPublicAccessToken,
} = require('../backend/dist/services/publicAccessTokenCrypto')

const BASE_URL = (process.env.SITUATIONAL_BUNDLE_E2E_BASE_URL || 'http://127.0.0.1:5173').replace(/\/$/, '')
const FIXTURE_FILE = process.env.SITUATIONAL_BUNDLE_E2E_FIXTURE_FILE || '/tmp/eduk12-situational-bundle-fixture.json'
const UPLOAD_ROOT = path.resolve(process.env.UPLOAD_DIR || 'uploads')
const configuredBrowserExecutable = process.env.SITUATIONAL_BUNDLE_E2E_BROWSER_EXECUTABLE
const browserCandidates = configuredBrowserExecutable
  ? [configuredBrowserExecutable]
  : [
      chromium.executablePath(),
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome for Testing',
      '/usr/bin/google-chrome',
      '/usr/bin/google-chrome-stable',
      '/usr/bin/chromium',
      '/usr/bin/chromium-browser',
      'C:/Program Files/Google/Chrome/Application/chrome.exe',
      'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    ]
const BROWSER_EXECUTABLE = browserCandidates.find((candidate) => fs.existsSync(candidate))
const baseFixture = JSON.parse(fs.readFileSync(FIXTURE_FILE, 'utf8'))
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64')
const pngHash = crypto.createHash('sha256').update(png).digest('hex')
const suffix = `${Date.now()}_${crypto.randomBytes(3).toString('hex')}`
const prisma = new PrismaClient()
const results = []

const record = (name) => {
  results.push(name)
  console.log(`[PASS] ${name}`)
}

const imagePresentation = (assetId, altText, caption) => ({
  asset: { assetId, contentHash: pngHash, mimeType: 'image/png' },
  altText,
  caption,
  order: 0,
})

const makeScaleDefinition = (scaleAssetId) => {
  const definition = createCustomScaleDefinition()
  definition.source = { title: 'MEDIA-2 browser acceptance fixture' }
  definition.items = [{
    itemCode: 'media2-q1',
    content: 'MEDIA-2 量表题目',
    images: [imagePresentation(scaleAssetId, 'MEDIA-2 scale question image', 'MEDIA-2 scale image caption')],
    type: 'single',
    required: true,
    sortOrder: 0,
    responseSetKey: 'default',
    randomizeOptions: false,
  }]
  definition.scoring.itemRules = [{ itemCode: 'media2-q1', transform: { type: 'identity' } }]
  definition.scoring.scores = [{
    key: 'total',
    type: 'total',
    label: '总分',
    direction: 'descriptive',
    canonical: true,
    displayPrecision: 1,
    source: { type: 'items', items: [{ itemCode: 'media2-q1', weight: 1 }], aggregation: 'sum' },
  }]
  definition.report.primaryScoreKeys = ['total']
  definition.report.scoreOrder = ['total']
  definition.report.interpretations = [{
    scoreKey: 'total',
    headline: '总分',
    source: { type: 'score_only' },
    summary: 'MEDIA-2 browser acceptance only.',
    bands: [],
    guidance: [],
  }]
  return definition
}

const seedStoredImage = async (assetId) => {
  const objectKey = `assets/${assetId}.png`
  const filePath = path.resolve(UPLOAD_ROOT, objectKey)
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, png)
  await prisma.storedAsset.create({
    data: {
      id: assetId,
      objectKey,
      provider: 'local',
      mimeType: 'image/png',
      sizeBytes: png.length,
      sha256: pngHash,
      originalName: `${assetId}.png`,
      accessScope: 'PRIVATE',
    },
  })
}

const seed = async () => {
  const student = await prisma.user.findUnique({ where: { username: baseFixture.student.username } })
  const course = await prisma.course.findUnique({ where: { id: baseFixture.course.id } })
  assert.ok(student, 'MEDIA-2 fixture student is missing')
  assert.ok(course, 'MEDIA-2 fixture course is missing')

  const formAssetId = `media2-form-${suffix}`
  const scaleAssetId = `media2-scale-${suffix}`
  await seedStoredImage(formAssetId)
  await seedStoredImage(scaleAssetId)

  const definition = makeScaleDefinition(scaleAssetId)
  const definitionHash = hashScaleDefinition(definition)
  const scale = await prisma.scale.create({
    data: {
      code: `MEDIA2_BROWSER_${suffix}`,
      name: `MEDIA-2 Image Scale ${suffix}`,
      description: 'MEDIA-2 browser-only Scale',
      status: 'PUBLISHED',
      visibility: 'PUBLIC',
      instrumentClass: 'CUSTOM_DESCRIPTIVE',
      instrumentVersion: '2.0.0',
      definition,
      definitionHash,
      itemCount: 1,
      dimensionCount: 0,
      estimatedTime: 1,
      creatorId: course.creatorId,
    },
  })

  const composite = await prisma.compositeAssessment.create({
    data: {
      code: `MEDIA2_COMPOSITE_${suffix}`,
      name: `MEDIA-2 Image Bundle ${suffix}`,
      description: 'MEDIA-2 Form + Scale image browser acceptance',
      instruction: 'Complete the image-enhanced Form and Scale.',
      status: 'PUBLISHED',
      courseId: course.id,
      createdBy: course.creatorId,
      publicEnabled: true,
      maxAttempts: 3,
      publishedAt: new Date(),
    },
  })
  const section = await prisma.compositeFormSection.create({
    data: {
      compositeAssessmentId: composite.id,
      title: 'MEDIA-2 Image Form',
      description: 'Choose the option associated with the image.',
      position: 0,
      contextSection: false,
    },
  })
  const formItem = await prisma.compositeAssessmentItem.create({
    data: {
      compositeAssessmentId: composite.id,
      type: 'FORM',
      position: 0,
      required: true,
      formType: 'single_choice',
      formLabel: 'MEDIA-2 表单题目',
      formOptions: [
        {
          value: 'media-a',
          label: '媒体选项 A',
          images: [imagePresentation(formAssetId, 'MEDIA-2 form option image', 'MEDIA-2 form option caption')],
        },
        { value: 'media-b', label: '媒体选项 B' },
      ],
      formSectionId: section.id,
      formSectionPosition: 0,
    },
  })
  const scaleItem = await prisma.compositeAssessmentItem.create({
    data: {
      compositeAssessmentId: composite.id,
      type: 'SCALE',
      position: 1,
      required: true,
      scaleId: scale.id,
    },
  })

  const publicToken = createAccessToken()
  await prisma.compositeAssessmentAccessToken.create({
    data: {
      compositeAssessmentId: composite.id,
      token: null,
      tokenHash: hashPublicAccessToken(publicToken),
      tokenEncrypted: encryptPublicAccessToken(publicToken),
      createdBy: course.creatorId,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      maxUses: 3,
      isActive: true,
    },
  })

  return {
    studentId: student.id,
    courseId: course.id,
    scale: { id: scale.id, name: scale.name, assetId: scaleAssetId },
    composite: { id: composite.id, name: composite.name, publicToken },
    sectionId: section.id,
    formItemId: formItem.id,
    scaleItemId: scaleItem.id,
    formAssetId,
  }
}

const apiFetch = async (page, endpoint, init = {}) => page.evaluate(async ({ endpoint: pathName, requestInit }) => {
  const token = window.localStorage.getItem('token')
  const response = await fetch(`/api${pathName}`, {
    ...requestInit,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(requestInit.headers || {}),
    },
  })
  const text = await response.text()
  let body = null
  try { body = text ? JSON.parse(text) : null } catch { body = text }
  return { status: response.status, body }
}, { endpoint, requestInit: init })

const assertSuccess = (response, label) => {
  assert.equal(response.status, 200, `${label}: HTTP ${response.status}`)
  assert.equal(response.body?.code, 0, `${label}: ${response.body?.message || 'API error'}`)
  return response.body.data
}

const loginStudent = async (page) => {
  await page.goto(`${BASE_URL}/student/login`, { waitUntil: 'domcontentloaded' })
  await page.getByPlaceholder('请输入用户名').fill(baseFixture.student.username)
  await page.getByPlaceholder('请输入密码').fill(baseFixture.student.password)
  await Promise.all([
    page.waitForURL(/\/student(?:\?|$)/, { timeout: 30000 }),
    page.getByRole('button', { name: '登录', exact: true }).click(),
  ])
  await page.getByText('我的课程', { exact: true }).waitFor({ state: 'visible', timeout: 30000 })
}

const assertImage = async (page, assetId, expectedAlt) => {
  const image = page.locator(`img[data-asset-id="${assetId}"]`).first()
  await image.waitFor({ state: 'visible', timeout: 30000 })
  await page.waitForFunction((id) => {
    const candidate = document.querySelector(`img[data-asset-id="${id}"]`)
    return candidate instanceof HTMLImageElement && candidate.naturalWidth > 0 && candidate.naturalHeight > 0
  }, assetId, { timeout: 30000 })
  assert.equal(await image.getAttribute('alt'), expectedAlt)
}

const expectSelectedButton = async (page, label) => {
  const button = page.getByRole('button', { name: label, exact: true })
  await button.waitFor({ state: 'visible', timeout: 30000 })
  assert.match((await button.getAttribute('class')) || '', /border-primary/, `${label} was not restored from local draft`)
}

const startAuthenticatedComposite = async (page, fixture) => {
  await page.goto(`${BASE_URL}/student/courses/${fixture.courseId}`, { waitUntil: 'domcontentloaded' })
  const tab = page.getByRole('button', { name: /^综合测评\s*\d*$/ }).first()
  await tab.waitFor({ state: 'visible', timeout: 30000 })
  await tab.click()
  await page.getByText(fixture.composite.name, { exact: true }).waitFor({ state: 'visible', timeout: 30000 })
  const card = page.locator('div.card').filter({ hasText: fixture.composite.name }).first()
  const responsePromise = page.waitForResponse((response) => (
    response.request().method() === 'POST'
      && response.url().includes(`/api/composite-assessments/${fixture.composite.id}/attempts`)
      && response.status() === 200
  ), { timeout: 30000 })
  await card.getByRole('button', { name: '开始测评', exact: true }).click()
  const body = await (await responsePromise).json()
  assert.equal(body.code, 0, body.message || 'MEDIA-2 authenticated composite start failed')
  return { parentId: body.data.attempt.id, recoveryToken: '' }
}

const startPublicComposite = async (page, fixture) => {
  const encoded = encodeURIComponent(fixture.composite.publicToken)
  await page.goto(`${BASE_URL}/public/composite/${encoded}`, { waitUntil: 'domcontentloaded' })
  await page.getByRole('heading', { name: fixture.composite.name }).waitFor({ state: 'visible', timeout: 30000 })
  const responsePromise = page.waitForResponse((response) => (
    response.request().method() === 'POST'
      && response.url().includes(`/api/public/composite-assessments/${fixture.composite.publicToken}/start`)
      && response.status() === 200
  ), { timeout: 30000 })
  await page.getByRole('button', { name: /开始匿名测评/, exact: true }).click()
  const body = await (await responsePromise).json()
  assert.equal(body.code, 0, body.message || 'MEDIA-2 public composite start failed')
  assert.ok(body.data?.attempt?.id, 'MEDIA-2 public parent id is missing')
  assert.ok(body.data?.recoveryToken, 'MEDIA-2 public recovery token is missing')
  return { parentId: body.data.attempt.id, recoveryToken: body.data.recoveryToken }
}

const waitForParentCompleted = async (page, parentId, recoveryToken = '') => {
  const endpoint = `${recoveryToken ? '/public' : ''}/composite-assessments/attempts/${parentId}`
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const response = await apiFetch(page, endpoint, recoveryToken ? { headers: { 'X-Recovery-Token': recoveryToken } } : {})
    if (response.status === 200 && response.body?.code === 0 && response.body?.data?.status === 'COMPLETED') return response.body.data
    await page.waitForTimeout(100)
  }
  throw new Error(`MEDIA-2 parent ${parentId} did not complete`)
}

const runStandaloneScale = async (browser, fixture) => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } })
  const page = await context.newPage()
  try {
    await loginStudent(page)
    await page.goto(`${BASE_URL}/student/scales/${fixture.scale.id}`, { waitUntil: 'domcontentloaded' })
    await page.getByRole('heading', { name: fixture.scale.name, exact: true }).waitFor({ state: 'visible', timeout: 30000 })
    await assertImage(page, fixture.scale.assetId, 'MEDIA-2 scale question image')
    await page.getByRole('button', { name: '选项 1', exact: true }).click()
    await page.waitForTimeout(250)
    await page.reload({ waitUntil: 'domcontentloaded' })
    await assertImage(page, fixture.scale.assetId, 'MEDIA-2 scale question image')
    await expectSelectedButton(page, '选项 1')
    await page.getByRole('button', { name: '完成测评', exact: true }).click()
    await page.waitForURL(/\/student\/scales\/result\//, { timeout: 30000 })

    const assessment = await prisma.assessment.findFirst({
      where: { scaleId: fixture.scale.id, userId: fixture.studentId, compositeAttemptId: null, questionnaireAssessmentId: null, status: 'COMPLETED' },
      orderBy: { startedAt: 'desc' },
      select: { id: true },
    })
    assert.ok(assessment, 'MEDIA-2 standalone Scale did not persist a completed attempt')
    const retained = await prisma.assetReference.findFirst({
      where: {
        assetId: fixture.scale.assetId,
        entityType: 'AssessmentFrozenRuntime',
        entityId: `SCALE:${assessment.id}`,
        field: 'media',
      },
    })
    assert.ok(retained, 'MEDIA-2 standalone frozen Scale image reference is missing after FINAL')
    record('media2-standalone-scale-render-resume-final')
  } finally {
    await context.close()
  }
}

const runCompositeFlow = async (browser, fixture, publicMode) => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } })
  const page = await context.newPage()
  try {
    if (!publicMode) await loginStudent(page)
    const started = publicMode
      ? await startPublicComposite(page, fixture)
      : await startAuthenticatedComposite(page, fixture)
    const { parentId, recoveryToken } = started

    await page.getByRole('heading', { name: 'MEDIA-2 Image Form', exact: true }).waitFor({ state: 'visible', timeout: 30000 })
    await assertImage(page, fixture.formAssetId, '选项：媒体选项 A — MEDIA-2 form option image')
    await page.getByRole('button', { name: '媒体选项 A', exact: true }).click()
    await page.waitForTimeout(250)

    const formRequest = publicMode
      ? page.waitForRequest((request) => request.url().includes(`/api/public/composite-assessments/attempts/${parentId}/form-sections/${fixture.sectionId}/assets/${fixture.formAssetId}/content`), { timeout: 30000 })
      : null
    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.getByRole('heading', { name: 'MEDIA-2 Image Form', exact: true }).waitFor({ state: 'visible', timeout: 30000 })
    await assertImage(page, fixture.formAssetId, '选项：媒体选项 A — MEDIA-2 form option image')
    await expectSelectedButton(page, '媒体选项 A')
    if (formRequest) {
      const request = await formRequest
      assert.equal(await request.headerValue('x-recovery-token'), recoveryToken, 'public Form image request did not carry the existing recovery token')
    }

    await page.getByRole('button', { name: '提交整个区段', exact: true }).click()
    await page.getByRole('heading', { name: fixture.scale.name, exact: true }).waitFor({ state: 'visible', timeout: 30000 })
    await assertImage(page, fixture.scale.assetId, 'MEDIA-2 scale question image')
    await page.getByRole('button', { name: '选项 1', exact: true }).click()
    await page.waitForTimeout(250)

    const scaleRequest = publicMode
      ? page.waitForRequest((request) => request.url().includes(`/api/public/composite-assessments/attempts/${parentId}/items/${fixture.scaleItemId}/scale/assets/${fixture.scale.assetId}/content`), { timeout: 30000 })
      : null
    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.getByRole('heading', { name: fixture.scale.name, exact: true }).waitFor({ state: 'visible', timeout: 30000 })
    await assertImage(page, fixture.scale.assetId, 'MEDIA-2 scale question image')
    await expectSelectedButton(page, '选项 1')
    if (scaleRequest) {
      const request = await scaleRequest
      assert.equal(await request.headerValue('x-recovery-token'), recoveryToken, 'public Scale image request did not carry the existing recovery token')
    }

    await page.getByRole('button', { name: '提交整份量表', exact: true }).click()
    await waitForParentCompleted(page, parentId, recoveryToken)

    const scaleChild = await prisma.assessment.findFirst({
      where: { compositeAttemptId: parentId, scaleId: fixture.scale.id },
      select: { id: true, status: true },
    })
    assert.equal(scaleChild?.status, 'COMPLETED', 'MEDIA-2 embedded Scale child did not complete')
    const scaleRef = await prisma.assetReference.findFirst({
      where: {
        assetId: fixture.scale.assetId,
        entityType: 'AssessmentFrozenRuntime',
        entityId: `SCALE:${scaleChild.id}`,
        field: 'media',
      },
    })
    assert.ok(scaleRef, 'MEDIA-2 embedded Scale frozen image reference is missing after FINAL')
    const formRef = await prisma.assetReference.findFirst({
      where: {
        assetId: fixture.formAssetId,
        entityType: 'AssessmentFrozenRuntime',
        entityId: `COMPOSITE:${parentId}:FORM_SECTION:${fixture.sectionId}`,
        field: 'media',
      },
    })
    assert.ok(formRef, 'MEDIA-2 embedded Form frozen image reference is missing after FINAL')
    record(publicMode ? 'media2-public-bundle-render-resume-final' : 'media2-authenticated-bundle-render-resume-final')
  } finally {
    await context.close()
  }
}

const main = async () => {
  assert.ok(BROWSER_EXECUTABLE, `browser executable not found; checked: ${browserCandidates.join(', ')}`)
  const fixture = await seed()
  const browser = await chromium.launch({ headless: true, executablePath: BROWSER_EXECUTABLE })
  try {
    await runStandaloneScale(browser, fixture)
    await runCompositeFlow(browser, fixture, false)
    await runCompositeFlow(browser, fixture, true)
    console.log('--- MEDIA-2 Scale + Form image browser acceptance ---')
    for (const name of results) console.log(`✅ ${name}`)
    console.log('ALL PASS')
  } finally {
    await browser.close()
  }
}

main()
  .catch((error) => {
    console.error('MEDIA-2 browser acceptance failed')
    console.error(error && error.stack ? error.stack : error)
    console.log('--- MEDIA-2 Scale + Form image browser acceptance ---')
    for (const name of results) console.log(`✅ ${name}`)
    console.log('BLOCKED')
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
