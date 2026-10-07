import { independentReviewer } from './independent-reviewer'
import { randomUUID } from 'node:crypto'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import type { Server } from 'node:http'
import express from 'express'
import bcrypt from 'bcryptjs'
import { chromium, type Browser, type BrowserContext } from 'playwright-core'
import { beforeAll, afterAll, describe, it, expect } from 'vitest'
import { config } from '../../config'
import { prisma } from '../../config/database'
import { integrationDatabaseUrl } from './integration-env'
import { buildReportingFixture } from './reporting-fixture'
import {
  createPlatformReportingSpec,
  reviewPlatformReportingSpec,
  publishPlatformReportingSpec,
} from '../../modules/reporting/spec'
import { generateOrganizationProtectedFeedback } from '../../modules/reporting/pr4Service'
import {
  createMembership,
  grantCapability,
  grantPersona,
} from '../../modules/organization/service'
import { parentToolPolicyService } from '../../modules/parent-portal/tool-policy'
import authRoutes from '../../routes/auth'
import questionnaireProductRoutes from '../../modules/questionnaire-product/routes'
import relationalProductRoutes from '../../modules/assessment-relational/product.routes'
import assessmentInboxRoutes from '../../modules/assessment-policy/inbox.routes'
import compositeRoutes from '../../modules/composite/composite.routes'
import userRoutes from '../../routes/users'
import capabilitiesRoutes from '../../routes/capabilities'
import organizationRoutes from '../../modules/organization/organization.routes'
import { organizationInvitationsRouter } from '../../modules/organization/invitations'
import {
  parentAccountsRouter,
  platformUsersRouter,
} from '../../modules/parent-portal/accounts.routes'
import { parentToolPolicyRouter } from '../../modules/parent-portal/tool-policy.routes'
import {
  parentLinksRouter,
  parentsRouter,
  parentPublicationRouter,
} from '../../modules/parent-portal/routes'
import { csrfProtection } from '../../middleware/csrf'
const url = integrationDatabaseUrl('RELEASE_INTEGRATION_DATABASE_URL'),
  suite =
    url && process.env.DOTQA_BROWSER_E2E === 'true' ? describe : describe.skip
const password = 'Synthetic-browser-123',
  parentPassword = 'ParentBrowser456',
  meta = (actorUserId: string) => ({ actorUserId, commandKey: randomUUID() })
let browser: Browser,
  server: Server,
  origin: string,
  previousFlag: boolean,
  passwordHash: string
const evidence =
  process.env.DOTQA_EVIDENCE_DIR ?? '/tmp/parent-organization-browser'
async function login(context: BrowserContext, username: string) {
  const csrf = await (
    await context.request.get(origin + '/api/auth/csrf')
  ).json()
  const response = await context.request.post(origin + '/api/auth/login', {
    data: { username, password },
    headers: { 'X-CSRF-Token': csrf.data.csrfToken },
  })
  expect(response.status()).toBe(200)
}
async function prepare() {
  const f = await buildReportingFixture(prisma, 3, true)
  const child = await prisma.user.update({
    where: { id: f.ownerId },
    data: { role: 'STUDENT', passwordHash },
  })
  const manager = await prisma.user.create({
    data: {
      username: 'publication-manager-' + randomUUID(),
      passwordHash,
      role: 'ADMIN',
      platformRole: 'SYSTEM_ADMIN',
    },
  })
  const principal = {
      userId: manager.id,
      role: 'ADMIN' as const,
      platformRole: 'SYSTEM_ADMIN' as const,
    },
    organizationId = f.organizationId
  const member = await createMembership({
    organizationId,
    userId: manager.id,
    orgRole: 'ORG_ADMIN',
    meta: meta(manager.id),
  })
  const [ref] = await prisma.$queryRaw<
    Array<{ key: string; version: string }>
  >`SELECT resource_key AS key,resource_version AS version FROM assessment_run_tracks WHERE id=${f.trackId}`
  const spec = await createPlatformReportingSpec({
    actor: principal,
    specKey: randomUUID(),
    version: 1,
    definition: {
      schemaVersion: 1,
      analysisKind: 'PROTECTED_FEEDBACK',
      engineKey: 'ORG_PROTECTED_FEEDBACK_V1',
      engineVersion: '1.0.0',
      privacyUnit: 'RESPONDENT',
      selectionPolicy: 'UNIQUE_OR_REJECT',
      minimumRespondentN: 3,
      minimumContributorN: 3,
      reportEvidenceCeiling: 'PILOT',
      metricRules: [
        {
          metricId: 'score',
          sourceMetricKey: 'score',
          sourceFamily: 'BUNDLE',
          sourceResourceKey: ref.key,
          valueType: 'NUMBER',
          longitudinalMetricKey: 'score',
          acceptedResultQuality: ['interpretable'],
          acceptedMetricQuality: 'IGNORE_METRIC_QUALITY',
          aggregations: ['MEAN'],
          missingnessRule: 'EXCLUDE',
          minimumMetricN: 3,
          observationUnit: 'RESPONDENT',
          selectionPolicy: 'UNIQUE_OR_REJECT',
        },
      ],
    },
  })
  await reviewPlatformReportingSpec({ actor: await independentReviewer(principal), specId: spec.id })
  await publishPlatformReportingSpec({ actor: principal, specId: spec.id })
  const report = await generateOrganizationProtectedFeedback({
    principal,
    organizationId,
    runId: f.runId,
    trackId: f.trackId,
    subjectUserId: child.id,
    relationshipKind: 'CLASS_TEACHER_STUDENT',
    perspective: 'RELATIONAL_EXPERIENCE',
    specId: spec.id,
  })
  const artifactId = report.artifactId,
    [sourceBefore] = await prisma.$queryRaw<
      any[]
    >`SELECT artifact_payload,snapshot_hash FROM reporting_analysis_artifacts WHERE id=${artifactId}`

  const membership = await prisma.organizationMembership.findFirstOrThrow({
    where: { organizationId, userId: child.id, validUntil: null },
  })
  await grantPersona({
    organizationId,
    membershipId: membership.id,
    persona: 'STUDENT',
    meta: meta(manager.id),
  })
  await grantCapability({
    organizationId,
    membershipId: member.id,
    capability: 'PARENT_REPORT_DISCLOSURE',
    meta: meta(manager.id),
  })
  await parentToolPolicyService.update(
    manager.id,
    { family: 'BUNDLE', ...ref },
    {
      policy: {
        mode: 'COMPLETION_ONLY',
        metricKeys: [],
        longitudinalMetricKeys: [],
      },
      expectedVersion: 0,
      commandKey: randomUUID(),
    },
  )
  return { child, manager, organizationId, artifactId }
}
suite(
  'Browser parent and organization support with actual HTTP, Cookie and PostgreSQL',
  () => {
    beforeAll(async () => {
      const selected = new URL(url!),
        actual = new URL(process.env.DATABASE_URL ?? '')
      if (
        !/test|ci/i.test(selected.pathname) ||
        selected.host !== actual.host ||
        selected.pathname !== actual.pathname
      )
        throw new Error('requires isolated selected test datasource')
      previousFlag = config.parentPortalEnabled
      config.parentPortalEnabled = true
      passwordHash = await bcrypt.hash(password, 4)
      const app = express()
      app.use(express.json())
      app.use('/api', csrfProtection)
      app.use('/api/auth', authRoutes)
      app.use('/api/users', userRoutes)
      app.use('/api/questionnaire-products', questionnaireProductRoutes)
      app.use('/api/capabilities', capabilitiesRoutes)
      app.use('/api/organizations', organizationRoutes)
      app.use('/api/organization-invitations', organizationInvitationsRouter)
      app.use('/api/parent-accounts', parentAccountsRouter)
      app.use('/api/platform-users', platformUsersRouter)
      app.use('/api/parent-tool-policies', parentToolPolicyRouter)
      app.use('/api/parent-links', parentLinksRouter)
      app.use('/api/parents', parentsRouter)
      app.use('/api/parent-report-publications', parentPublicationRouter)
      app.use('/api/relational-assessments', relationalProductRoutes)
      app.use('/api/my-assessments', assessmentInboxRoutes)
      app.use('/api/composite-assessments', compositeRoutes)
      app.use('/api', (_q, r) =>
        r.status(404).json({
          code: 404,
          message: 'fixture route unavailable',
          data: null,
        }),
      )
      app.use((e: any, _q: any, r: any, _n: any) =>
        r.status(500).json({
          code: 'FIXTURE_ERROR',
          message: String(e.message),
          data: null,
        }),
      )
      const dist = path.resolve('../frontend/dist')
      app.use(express.static(dist))
      app.get('*', (_q, r) => r.sendFile(path.join(dist, 'index.html')))
      server = app.listen(0, '127.0.0.1')
      await new Promise<void>((r) => server.once('listening', r))
      const address = server.address()
      if (!address || typeof address === 'string')
        throw new Error('listener missing')
      origin = 'http://127.0.0.1:' + address.port
      await mkdir(evidence, { recursive: true })
      browser = await chromium.launch({ headless: true, channel: 'chrome' })
    }, 90000)
    afterAll(async () => {
      config.parentPortalEnabled = previousFlag
      if (browser) await browser.close()
      if (server) {
        server.closeAllConnections()
        await new Promise<void>((r) => server.close(() => r()))
      }
      await prisma.$disconnect()
    })
    it('additional QA: questionnaire blank draft feedback and form controls with the actual API', async () => {
      const manager = await prisma.user.create({
        data: {
          username: 'qa-editor-' + randomUUID(),
          passwordHash,
          role: 'TEACHER',
        },
      })
      const context = await browser.newContext({
        viewport: { width: 390, height: 844 },
      })
      const page = await context.newPage()
      page.setDefaultTimeout(15000)
      try {
        await login(context, manager.username)
        await page.goto(origin + '/questionnaire-products/new')
        await page.getByRole('button', { name: '创建草稿' }).click()
        await page.getByText('请填写问卷名称', { exact: true }).waitFor()
        await page.screenshot({
          path: path.join(evidence, 'additional-questionnaire-empty-error.png'),
          fullPage: true,
        })
        await page.getByLabel('问卷名称').fill('合成表单编排验收')
        await page.getByRole('button', { name: '创建草稿' }).click()
        await page.waitForURL(
          (u) => u.pathname !== '/questionnaire-products/new',
        )
        await page.getByLabel('测评类型').selectOption('FORM')
        const input = page.getByLabel('题目文字')
        await input.fill('合成主观题，无科学评分')
        const style = await input.evaluate((e) => ({
          border: getComputedStyle(e).borderTopWidth,
          height: e.getBoundingClientRect().height,
        }))
        expect(style.border).toBe('1px')
        expect(style.height).toBeGreaterThanOrEqual(44)
        const added = page.waitForResponse(
          (response) =>
            response.url().endsWith('/items') &&
            response.request().method() === 'POST',
        )
        await page.getByRole('button', { name: '添加到问卷' }).click()
        const addedResponse = await added
        const result = await addedResponse.json()
        expect(addedResponse.status()).toBe(200)
        expect(result.data.formSections[0].items[0].formLabel).toBe(
          '合成主观题，无科学评分',
        )
        await page.getByText('合成主观题，无科学评分').waitFor()
        await page.getByRole('button', { name: '移除此题' }).waitFor()
        await page.screenshot({
          path: path.join(evidence, 'additional-questionnaire-controls.png'),
          fullPage: true,
        })
        expect(
          await page.evaluate(() => document.documentElement.scrollWidth),
        ).toBeLessThanOrEqual(390)
      } finally {
        await context.close()
      }
    }, 60000)
    it('additional QA: organization reflow and shared-cookie account changes clear the old form', async () => {
      const manager = await prisma.user.create({
        data: {
          username: 'qa-admin-' + randomUUID(),
          passwordHash,
          role: 'ADMIN',
          platformRole: 'SYSTEM_ADMIN',
        },
      })
      const child = await prisma.user.create({
        data: {
          username: 'qa-student-' + randomUUID(),
          passwordHash,
          role: 'STUDENT',
        },
      })
      const org = await prisma.organization.create({
        data: {
          id: randomUUID(),
          name: '超窄视口组织标题与控件重排验收组织',
          createdByUserId: manager.id,
        },
      })
      const context = await browser.newContext({
        viewport: { width: 390, height: 844 },
      })
      const page = await context.newPage()
      page.setDefaultTimeout(15000)
      try {
        await login(context, manager.username)
        await page.goto(origin + '/organizations/' + org.id)
        await page
          .getByRole('heading', { name: org.name, exact: true })
          .waitFor()
        for (const width of [360, 390, 640, 720, 1440, 250]) {
          await page.setViewportSize({ width, height: 844 })
          const dimensions = await page.evaluate(() => ({
            width: innerWidth,
            scrollWidth: document.documentElement.scrollWidth,
            overflow: [...document.querySelectorAll('body *')]
              .filter((e) => e.getBoundingClientRect().right > innerWidth + 1)
              .slice(0, 10)
              .map((e) => ({
                tag: e.tagName,
                class: e.className,
                text: e.textContent?.slice(0, 50),
              })),
          }))
          console.info('DOTQA_REFLOW', JSON.stringify(dimensions))
          await page.screenshot({
            path: path.join(evidence, `additional-org-${width}.png`),
            fullPage: true,
          })
          expect(dimensions.scrollWidth).toBeLessThanOrEqual(width)
        }
        await page.setViewportSize({ width: 1280, height: 800 })
        await page.getByLabel('搜索组织成员').fill('合成旧账号输入')
        await login(context, child.username)
        await page.evaluate(() => window.dispatchEvent(new Event('focus')))
        await page.getByText('无法进入组织空间', { exact: true }).waitFor()
        expect(await page.getByLabel('搜索组织成员').count()).toBe(0)
        await page.screenshot({
          path: path.join(evidence, 'additional-session-focus.png'),
          fullPage: true,
        })
        await login(context, manager.username)
        await page.evaluate(() => window.dispatchEvent(new Event('focus')))
        await page.getByLabel('搜索组织成员').fill('另一标签登录前的旧表单')
        const second = await context.newPage()
        await second.goto(origin + '/student/login')
        await second.getByLabel('用户名', { exact: true }).fill(child.username)
        await second.getByLabel('密码', { exact: true }).fill(password)
        await second.getByRole('button', { name: '登录', exact: true }).click()
        await second.waitForURL((u) => u.pathname === '/student')
        // No manual refresh or focus event: BroadcastChannel/storage invalidates the old tab.
        await page.getByText('无法进入组织空间', { exact: true }).waitFor()
        expect(await page.getByLabel('搜索组织成员').count()).toBe(0)
        await page.screenshot({
          path: path.join(evidence, 'additional-session-changed.png'),
          fullPage: true,
        })
      } finally {
        await context.close()
      }
    }, 90000)
    it('B1 member invitation lets a previously unaffiliated student enter only the selected organization', async () => {
      const manager = await prisma.user.create({
          data: {
            username: 'b1-browser-admin-' + randomUUID(),
            passwordHash,
            role: 'ADMIN',
            platformRole: 'SYSTEM_ADMIN',
          },
        }),
        child = await prisma.user.create({
          data: {
            username: 'b1-browser-student-' + randomUUID(),
            passwordHash,
            role: 'STUDENT',
          },
        }),
        org = await prisma.organization.create({
          data: {
            id: randomUUID(),
            name: 'B1 浏览器验收组织',
            createdByUserId: manager.id,
          },
        })
      await createMembership({
        organizationId: org.id,
        userId: manager.id,
        orgRole: 'ORG_ADMIN',
        meta: meta(manager.id),
      })
      const a = await browser.newContext(),
        s = await browser.newContext({ viewport: { width: 390, height: 844 } }),
        admin = await a.newPage(),
        student = await s.newPage()
      admin.setDefaultTimeout(15000)
      student.setDefaultTimeout(15000)
      try {
        await login(a, manager.username)
        await login(s, child.username)
        expect(
          (await (await s.request.get(origin + '/api/organizations')).json())
            .data.total,
        ).toBe(0)
        await admin.goto(origin + '/organizations/' + org.id)
        await admin.getByLabel('加入后的工作身份').selectOption('STUDENT')
        await admin.getByRole('button', { name: '生成成员邀请码' }).click()
        await admin.getByRole('button', { name: '复制成员邀请码' }).waitFor()
        const code = await admin
          .locator('section[aria-label="成员邀请"]')
          .locator('code')
          .innerText()
        await student.goto(origin + '/organization-invitations')
        await student.getByLabel('组织成员邀请码').fill(code)
        await student.getByRole('button', { name: '核对邀请' }).click()
        await student.getByText('将加入为普通成员，工作身份：学生。').waitFor()
        await student.getByRole('button', { name: '确认加入这个组织' }).click()
        await student.waitForURL(
          (u) => u.pathname === '/organizations/' + org.id,
        )
        await student
          .getByRole('heading', { name: 'B1 浏览器验收组织', exact: true })
          .waitFor()
        await student.screenshot({
          path: path.join(evidence, 'b1-member-390.png'),
          fullPage: true,
        })
        const context = await (
          await s.request.get(
            origin + '/api/organizations/' + org.id + '/context',
          )
        ).json()
        expect(context.data.access).toMatchObject({
          orgRole: 'MEMBER',
          personas: ['STUDENT'],
          capabilities: [],
        })
        expect(context.data.allowedActions).not.toContain('GOVERN')
        expect(context.data.allowedActions).not.toContain(
          'PARENT_REPORT_PUBLICATION',
        )
        expect(
          await student
            .locator('body')
            .evaluate(
              () => document.documentElement.scrollWidth <= window.innerWidth,
            ),
        ).toBe(true)
      } finally {
        await a.close()
        await s.close()
      }
    }, 60000)
    it.each([1440, 390])(
      'independent administrator, student and parent sessions complete account, confirmation, publication, consent and withdrawal at %i px',
      async (width) => {
        const f = await prepare(),
          a = await browser.newContext({ viewport: { width, height: 900 } }),
          s = await browser.newContext({ viewport: { width, height: 900 } }),
          p = await browser.newContext({ viewport: { width, height: 900 } }),
          contexts = [a, s, p],
          errors: string[] = []
        const admin = await a.newPage(),
          student = await s.newPage(),
          parent = await p.newPage()
        for (const page of [admin, student, parent]) {
          page.setDefaultTimeout(15000)
          page.on('pageerror', (e) => errors.push(e.message))
        }
        for (const page of [admin, student, parent])
          page.on('dialog', (d) => void d.accept())
        try {
          await login(a, f.manager.username)
          await login(s, f.child.username)
          const username = 'browserparent_' + randomUUID().slice(0, 8)
          await admin.goto(origin + '/parent-accounts')
          await admin.getByLabel('用户名', { exact: true }).fill(username)
          await admin.getByLabel('家长显示名').fill('浏览器验收家长')
          await admin
            .getByLabel('初始密码', { exact: true })
            .fill('InitialBrowser123')
          await admin
            .getByRole('button', { name: '建立家长账号', exact: true })
            .click()
          await admin
            .getByText('家长账号已建立，首次登录需修改密码', { exact: true })
            .waitFor()
          expect(
            await admin.getByLabel('初始密码', { exact: true }).inputValue(),
          ).toBe('')
          await parent.goto(origin + '/parent/login')
          await parent.getByLabel('用户名', { exact: true }).fill(username)
          await parent
            .getByLabel('密码', { exact: true })
            .fill('InitialBrowser123')
          await parent
            .getByRole('button', { name: '登录', exact: true })
            .click()
          await parent
            .getByRole('heading', { name: '首次登录需要修改密码' })
            .waitFor()
          await parent
            .getByLabel('临时密码', { exact: true })
            .fill('InitialBrowser123')
          await parent
            .getByLabel('新密码', { exact: true })
            .fill(parentPassword)
          await parent.getByLabel('确认新密码').fill(parentPassword)
          await parent
            .getByRole('button', { name: '修改密码并重新登录' })
            .click()
          await parent.getByLabel('用户名', { exact: true }).fill(username)
          await parent.getByLabel('密码', { exact: true }).fill(parentPassword)
          await parent
            .getByRole('button', { name: '登录', exact: true })
            .click()
          await parent.waitForURL((u) => u.pathname === '/parent')
          await student.goto(origin + '/student/parent-links')
          await student
            .getByLabel('邀请来源')
            .selectOption('ORGANIZATION:' + f.organizationId)
          await student.getByRole('button', { name: '生成家长邀请码' }).click()
          await student.getByRole('button', { name: '复制邀请码' }).waitFor()
          const inviteCode = await student.locator('code').innerText()
          await parent.goto(origin + '/parent/links')
          await parent.getByLabel('孩子提供的邀请码').fill(inviteCode)
          await parent.getByRole('button', { name: '提交关联申请' }).click()
          await parent
            .getByText('申请已提交，等待学生确认', { exact: true })
            .waitFor()
          await student.reload()
          await student.getByRole('checkbox').check()
          await student
            .getByRole('button', { name: '确认关联', exact: true })
            .click()
          await student.getByRole('link', { name: '管理报告授权' }).waitFor()
          await admin.goto(origin + '/organizations/' + f.organizationId)
          await admin
            .getByRole('heading', { name: '成员关系', exact: true })
            .waitFor()
          await admin.screenshot({
            path: path.join(evidence, 'organization-members-' + width + '.png'),
            fullPage: true,
          })
          await admin.goto(
            origin + '/organizations/' + f.organizationId + '/parent-reports',
          )
          await admin.getByRole('button', { name: '处理这份报告' }).click()
          await admin
            .getByLabel('家长报告模板')
            .selectOption('parent-report-availability:1.0.0')
          await admin.getByRole('button', { name: '生成家长报告预览' }).click()
          await admin.getByRole('button', { name: '确认发布此版本' }).click()
          await admin
            .getByText('家长报告已发布，请等待学生逐份同意后授权')
            .waitFor()
          const link = await prisma.parentStudentRelationship.findFirstOrThrow({
            where: { studentUserId: f.child.id, status: 'ACTIVE' },
          })
          await student.goto(
            origin +
              '/student/parent-links/' +
              link.id +
              '/reports/' +
              f.artifactId,
          )
          await student.getByText('浏览器验收家长', { exact: true }).waitFor()
          expect(
            await student
              .getByRole('button', { name: '同意这份报告' })
              .isDisabled(),
          ).toBe(true)
          await student.getByRole('checkbox').check()
          await student.getByRole('button', { name: '同意这份报告' }).click()
          await student
            .getByText('已同意当前报告版本', { exact: true })
            .waitFor()
          await admin
            .getByRole('button', { name: '查看学生同意与授权' })
            .click()
          await admin
            .getByRole('button', { name: '授权给 浏览器验收家长' })
            .click()
          await admin.getByText('已为 浏览器验收家长 授权本份报告').waitFor()
          await parent.goto(
            origin +
              '/parent/children/' +
              f.child.id +
              '/reports/' +
              f.artifactId,
          )
          await parent.getByRole('article', { name: '家长版报告' }).waitFor()
          await parent.getByText('本份报告展示测评完成情况。').waitFor()
          await parent.screenshot({
            path: path.join(evidence, 'parent-report-' + width + '.png'),
            fullPage: true,
          })
          expect(
            await parent
              .locator('body')
              .evaluate(
                () => document.documentElement.scrollWidth <= window.innerWidth,
              ),
          ).toBe(true)
          if (width === 390) {
            await parent
              .getByRole('button', { name: '停止查看本份报告', exact: true })
              .click()
            await parent
              .getByRole('dialog', { name: '停止查看本份报告' })
              .waitFor()
            expect(
              await parent
                .locator('body')
                .evaluate(
                  () =>
                    document.documentElement.scrollWidth <= window.innerWidth,
                ),
            ).toBe(true)
            await parent
              .getByRole('button', { name: '确认停止查看', exact: true })
              .click()
            await parent
              .getByText('本份报告授权已撤回', { exact: true })
              .waitFor()
            expect(
              await parent.getByRole('article', { name: '家长版报告' }).count(),
            ).toBe(0)
            expect(
              (
                await prisma.parentStudentRelationship.findUniqueOrThrow({
                  where: { id: link.id },
                })
              ).status,
            ).toBe('ACTIVE')
            expect(
              (
                await (
                  await p.request.get(
                    origin +
                      '/api/parents/me/children/' +
                      f.child.id +
                      '/reports',
                  )
                ).json()
              ).data.list,
            ).toEqual([])
            await parent.reload()
            await parent
              .getByText('报告暂时不可查看', { exact: true })
              .waitFor()
          } else {
            await student
              .getByRole('button', { name: '撤回本份报告授权' })
              .click()
            await student.getByText('本份报告授权已撤回').waitFor()
            await parent.evaluate(() =>
              window.dispatchEvent(new Event('focus')),
            )
            await parent
              .getByText('报告暂时不可查看', { exact: true })
              .waitFor()
            expect(
              await parent.getByRole('article', { name: '家长版报告' }).count(),
            ).toBe(0)
          }
          expect(errors).toEqual([])
        } catch (e) {
          await admin.screenshot({
            path: path.join(evidence, 'failure-admin-' + width + '.png'),
            fullPage: true,
          })
          await student.screenshot({
            path: path.join(evidence, 'failure-student-' + width + '.png'),
            fullPage: true,
          })
          await parent.screenshot({
            path: path.join(evidence, 'failure-parent-' + width + '.png'),
            fullPage: true,
          })
          throw e
        } finally {
          await Promise.all(contexts.map((c) => c.close()))
        }
      },
      120000,
    )
  },
)
