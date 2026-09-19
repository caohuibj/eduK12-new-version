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

const login = async (context) => {
  const csrf = await assertEnvelope(await context.request.get(`${baseUrl}/api/auth/csrf`), 'csrf before login')
  await assertEnvelope(await context.request.post(`${baseUrl}/api/auth/login`, {
    headers: { 'x-csrf-token': csrf.csrfToken },
    data: { username: fixture.username, password: fixture.password },
  }), 'login')
  // Login rotates the session. Refresh the double-submit token inside the new session.
  await assertEnvelope(await context.request.get(`${baseUrl}/api/auth/csrf`), 'csrf after login')
}

const screenshot = async (page, name) => {
  mkdirSync(screenshotDir, { recursive: true })
  await page.screenshot({ path: `${screenshotDir}/${name}.png`, fullPage: true })
}

const main = async () => {
  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } })
  const page = await context.newPage()
  try {
    await login(context)

    // Direct-link into an Organization as a legacy STUDENT. The page must honor
    // current ORG_ADMIN Membership rather than legacy User.role.
    await page.goto(`${baseUrl}/organizations/${fixture.organizationId}`, { waitUntil: 'domcontentloaded' })
    await page.getByRole('heading', { name: fixture.organizationName, exact: true }).waitFor()
    await page.getByRole('heading', { name: '成员关系', exact: true }).waitFor()
    await page.getByText('PR5 Organization Owner · 学生', { exact: true }).waitFor()
    assert.equal(await page.getByRole('link', { name: 'Runs', exact: true }).count(), 1, 'ORG_ADMIN must see Run product entry even with legacy STUDENT role')
    assert.equal(await page.getByRole('link', { name: 'Reporting', exact: true }).count(), 1, 'ORG_ADMIN must see Reporting product entry from server Organization context')

    // Real governed structure mutation through the browser/API stack.
    await page.getByLabel('年级名称').fill(fixture.gradeName)
    await page.getByRole('button', { name: '新增年级' }).click()
    await page.getByText(fixture.gradeName, { exact: true }).waitFor()
    await screenshot(page, '01-organization-admin')

    // Real Run create, then hard reload to prove durable read-model navigation.
    await page.getByRole('link', { name: 'Runs', exact: true }).click()
    await page.getByRole('heading', { name: 'Assessment Runs', exact: true }).waitFor()
    await page.getByLabel('Run 名称').fill(fixture.runName)
    await page.getByRole('button', { name: '创建草稿' }).click()
    await page.getByRole('heading', { name: fixture.runName, exact: true }).waitFor()
    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.getByRole('heading', { name: fixture.runName, exact: true }).waitFor()
    await page.getByRole('heading', { name: 'Track 与冻结事实', exact: true }).waitFor()
    await screenshot(page, '02-run-durable-direct-link')

    // Reporting and Delivery must be reachable from current server context even
    // though no legacy TEACHER/ADMIN route guard is involved.
    await page.getByRole('link', { name: 'Reporting', exact: true }).click()
    await page.getByRole('heading', { name: 'Organization Reporting', exact: true }).waitFor()
    await page.getByRole('heading', { name: 'GROUP report', exact: true }).waitFor()
    await page.getByRole('link', { name: 'Safety / CSV', exact: true }).click()
    await page.getByRole('heading', { name: 'Safety & CSV Delivery', exact: true }).waitFor()
    await page.getByRole('heading', { name: 'Safety inbox', exact: true }).waitFor()
    await screenshot(page, '03-reporting-delivery')

    // Tenant isolation: exact context read and direct URL both fail closed.
    const foreignContext = await context.request.get(`${baseUrl}/api/organizations/${fixture.foreignOrganizationId}/context`)
    assert.equal(foreignContext.status(), 404, 'cross-Organization context guessing must be hidden')
    await page.goto(`${baseUrl}/organizations/${fixture.foreignOrganizationId}`, { waitUntil: 'domcontentloaded' })
    await page.getByText('无法进入组织空间', { exact: true }).waitFor()

    // Return to the owned Organization and terminate this exact Membership
    // episode. A backup ORG_ADMIN exists, so the governance invariant permits
    // the operation. Current access must disappear immediately after reload.
    await page.goto(`${baseUrl}/organizations/${fixture.organizationId}`, { waitUntil: 'domcontentloaded' })
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

    console.log('PR5 Organization real-browser acceptance passed')
  } finally {
    await context.close()
    await browser.close()
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
