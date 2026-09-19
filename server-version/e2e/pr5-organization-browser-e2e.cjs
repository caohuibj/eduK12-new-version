const assert = require('node:assert/strict')
const { readFileSync, mkdirSync } = require('node:fs')
const { chromium } = require('../backend/node_modules/playwright-core')

const baseUrl = (process.env.PR5_ORGANIZATION_E2E_BASE_URL || 'http://127.0.0.1:5173').replace(/\/$/, '')
const fixtureFile = process.env.PR5_ORGANIZATION_E2E_FIXTURE_FILE || '/tmp/eduk12-pr5-organization-fixture.json'
const screenshotDir = process.env.PR5_ORGANIZATION_E2E_SCREENSHOT_DIR || '/tmp/eduk12-situational-bundle-e2e/pr5-organization'
const fixture = JSON.parse(readFileSync(fixtureFile, 'utf8'))

const assertEnvelope = async (response, label) => {
  const body = await response.json()
  assert.equal(response.ok(), true, `${label} HTTP ${response.status()}: ${JSON.stringify(body)}`)
  assert.equal(body.code, 0, `${label} API failure: ${JSON.stringify(body)}`)
  return body.data
}

const login = async (context, user) => {
  const csrf = await assertEnvelope(await context.request.get(`${baseUrl}/api/auth/csrf`), 'csrf before login')
  await assertEnvelope(await context.request.post(`${baseUrl}/api/auth/login`, {
    headers: { 'x-csrf-token': csrf.csrfToken },
    data: { username: user.username, password: user.password },
  }), `login ${user.username}`)
  await assertEnvelope(await context.request.get(`${baseUrl}/api/auth/csrf`), 'csrf after login')
}

const screenshot = async (page, name) => {
  mkdirSync(screenshotDir, { recursive: true })
  await page.screenshot({ path: `${screenshotDir}/${name}.png`, fullPage: true })
}

const organizationPath = `/organizations/${fixture.organizationId}`

const assertPublishedGroupSpec = async (page) => {
  // Native <option> elements are not considered visible by Playwright even
  // when they are present in a rendered <select>. Exercise the actual control
  // instead: selectOption waits for the discovered option to exist and proves
  // that the published spec is usable by the product surface.
  const specSelect = page.getByLabel('Published GROUP spec')
  await specSelect.selectOption(fixture.publishedSpec.id)
  assert.equal(
    await specSelect.inputValue(),
    fixture.publishedSpec.id,
    'published GROUP spec must be discoverable and selectable',
  )
}

const ownerJourney = async (browser) => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } })
  const page = await context.newPage()
  try {
    await login(context, fixture.users.owner)

    // Legacy STUDENT + current ORG_ADMIN Membership must govern the tenant.
    await page.goto(`${baseUrl}${organizationPath}`, { waitUntil: 'domcontentloaded' })
    await page.getByRole('heading', { name: fixture.organizationName, exact: true }).waitFor()
    await page.getByRole('heading', { name: '成员关系', exact: true }).waitFor()
    await page.getByText(/· 学生$/).waitFor()
    assert.equal(await page.getByRole('link', { name: 'Runs', exact: true }).count() > 0, true, 'ORG_ADMIN must see Run product entry even with legacy STUDENT role')
    assert.equal(await page.getByRole('link', { name: 'Reporting', exact: true }).count() > 0, true, 'ORG_ADMIN must see Reporting product entry from server Organization context')

    await page.getByLabel('年级名称').fill(fixture.gradeName)
    await page.getByRole('button', { name: '新增年级' }).click()
    await page.getByRole('region', { name: '年级与班级结构' }).locator('strong').filter({ hasText: fixture.gradeName }).waitFor()
    await screenshot(page, '01-organization-admin')

    // Real Run mutation, then hard reload to prove durable read-model navigation.
    await page.goto(`${baseUrl}${organizationPath}/runs`, { waitUntil: 'domcontentloaded' })
    await page.getByRole('heading', { name: 'Assessment Runs', exact: true }).waitFor()
    await page.getByLabel('Run 名称').fill(fixture.runName)
    await page.getByRole('button', { name: '创建草稿' }).click()
    await page.getByRole('heading', { name: fixture.runName, exact: true }).waitFor()
    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.getByRole('heading', { name: fixture.runName, exact: true }).waitFor()
    await page.getByRole('heading', { name: 'Track 与冻结事实', exact: true }).waitFor()
    await screenshot(page, '02-run-durable-direct-link')

    await page.goto(`${baseUrl}${organizationPath}/reporting`, { waitUntil: 'domcontentloaded' })
    await page.getByRole('heading', { name: 'Organization Reporting', exact: true }).waitFor()
    await assertPublishedGroupSpec(page)
    await page.goto(`${baseUrl}${organizationPath}/delivery`, { waitUntil: 'domcontentloaded' })
    await page.getByRole('heading', { name: 'Safety & CSV Delivery', exact: true }).waitFor()
    await page.getByRole('heading', { name: 'Safety inbox', exact: true }).waitFor()
    await screenshot(page, '03-reporting-delivery')

    // Tenant isolation: exact context read and direct URL both fail closed.
    const foreignContext = await context.request.get(`${baseUrl}/api/organizations/${fixture.foreignOrganizationId}/context`)
    assert.equal(foreignContext.status(), 404, 'cross-Organization context guessing must be hidden')
    await page.goto(`${baseUrl}/organizations/${fixture.foreignOrganizationId}`, { waitUntil: 'domcontentloaded' })
    await page.getByText('无法进入组织空间', { exact: true }).waitFor()

    // End the owner episode only after the other journeys have been seeded; a
    // backup ORG_ADMIN preserves the last-admin invariant.
    await page.goto(`${baseUrl}${organizationPath}`, { waitUntil: 'domcontentloaded' })
    await page.getByRole('heading', { name: fixture.organizationName, exact: true }).waitFor()
    const ownerRow = page.getByRole('row').filter({ hasText: fixture.ownerUserId })
    await ownerRow.waitFor()
    await ownerRow.getByRole('button', { name: '结束关系' }).click()
    await page.getByText('无法进入组织空间', { exact: true }).waitFor()
    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.getByText('无法进入组织空间', { exact: true }).waitFor()

    const revokedContext = await context.request.get(`${baseUrl}/api/organizations/${fixture.organizationId}/context`)
    assert.equal(revokedContext.status(), 404, 'ended Membership must revoke current Organization context immediately')
    const discovery = await assertEnvelope(await context.request.get(`${baseUrl}/api/organizations?page=1&pageSize=100`), 'organization discovery after revoke')
    assert.equal(discovery.list.some((item) => item.id === fixture.organizationId), false, 'ended Membership must disappear from current Organization discovery')
    await screenshot(page, '04-membership-revoked')
    console.log('[PASS] ORG_ADMIN legacy-STUDENT governance, durable Run, tenant isolation and revocation')
  } finally {
    await context.close()
  }
}

const teacherJourney = async (browser) => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } })
  const page = await context.newPage()
  try {
    await login(context, fixture.users.teacher)
    await page.goto(`${baseUrl}${organizationPath}`, { waitUntil: 'domcontentloaded' })
    await page.getByRole('heading', { name: fixture.organizationName, exact: true }).waitFor()
    await page.getByText('只读组织上下文', { exact: true }).waitFor()
    assert.equal(await page.getByRole('link', { name: 'Runs', exact: true }).count(), 0, 'TEACHER persona must not gain governance')
    assert.equal(await page.getByRole('link', { name: 'Reporting', exact: true }).count() > 0, true, 'TEACHER persona must get Reporting independently of legacy role')
    assert.equal(await page.getByRole('link', { name: /Safety \/ CSV|Safety\/CSV/ }).count() > 0, true, 'TEACHER persona must get Safety responsibility surface')

    await page.goto(`${baseUrl}${organizationPath}/reporting`, { waitUntil: 'domcontentloaded' })
    await page.getByRole('heading', { name: 'Organization Reporting', exact: true }).waitFor()
    await assertPublishedGroupSpec(page)
    await page.goto(`${baseUrl}${organizationPath}/delivery`, { waitUntil: 'domcontentloaded' })
    await page.getByRole('heading', { name: 'Safety & CSV Delivery', exact: true }).waitFor()
    await page.getByText('当前没有可见 Safety case。', { exact: true }).waitFor()
    console.log('[PASS] TEACHER persona legacy-STUDENT receives reporting/delivery without governance')
  } finally {
    await context.close()
  }
}

const studentJourney = async (browser) => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } })
  const page = await context.newPage()
  try {
    await login(context, fixture.users.student)
    const discovery = await assertEnvelope(await context.request.get(`${baseUrl}/api/organizations?page=1&pageSize=100`), 'student organization discovery')
    assert.equal(discovery.list.some((item) => item.id === fixture.organizationId), true, 'current student Membership must discover Organization')
    await page.goto(`${baseUrl}${organizationPath}`, { waitUntil: 'domcontentloaded' })
    await page.getByText('只读组织上下文', { exact: true }).waitFor()
    assert.equal(await page.getByRole('link', { name: 'Runs', exact: true }).count(), 0)
    assert.equal(await page.getByRole('link', { name: 'Reporting', exact: true }).count(), 0)
    assert.equal(await page.getByRole('link', { name: /Safety \/ CSV|Safety\/CSV/ }).count(), 0)
    console.log('[PASS] STUDENT Membership gets tenant context without governance/reporting escalation')
  } finally {
    await context.close()
  }
}

const parentJourney = async (browser) => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } })
  const page = await context.newPage()
  try {
    await login(context, fixture.users.parent)
    const discovery = await assertEnvelope(await context.request.get(`${baseUrl}/api/organizations?page=1&pageSize=100`), 'parent organization discovery')
    assert.equal(discovery.list.some((item) => item.id === fixture.organizationId), false, 'Parent relationship must not be promoted into Organization Membership discovery')
    await page.goto(`${baseUrl}${organizationPath}`, { waitUntil: 'domcontentloaded' })
    await page.getByText('无法进入组织空间', { exact: true }).waitFor()
    assert.equal(await page.getByText(fixture.organizationName, { exact: true }).count(), 0, 'parent direct URL must not reveal tenant product context')
    console.log('[PASS] PARENT relationship remains external and does not create tenant membership')
  } finally {
    await context.close()
  }
}

const main = async () => {
  const browser = await chromium.launch({ headless: true })
  try {
    // Non-owner journeys run before owner Membership revocation so they prove
    // independent current authority while the Organization is active.
    await teacherJourney(browser)
    await studentJourney(browser)
    await parentJourney(browser)
    await ownerJourney(browser)
    console.log('PR5 Organization cross-role real-browser acceptance passed')
  } finally {
    await browser.close()
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
