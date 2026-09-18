import { Request, Response } from 'express'
import { prisma } from '../config/database'
import { error, notFound, success } from '../utils/response'
import { logger } from '../utils/logger'

/**
 * Identity history is retention-critical once Organization governance exists.
 * The production "delete" operation therefore deactivates the account and
 * invalidates all bearer credentials instead of physically deleting users.
 */
export const userLifecycleController = {
  async deactivate(req: Request, res: Response) {
    try {
      const { id } = req.params
      const user = await prisma.user.findUnique({
        where: { id },
        select: { id: true, isActive: true },
      })
      if (!user) return notFound(res, '用户不存在')

      const result = await prisma.$transaction(async (tx) => {
        // Lock every organization for which this account is currently an
        // ORG_ADMIN, in deterministic order, before evaluating the invariant.
        const orgs = await tx.$queryRaw<Array<{ organizationId: string }>>`
          SELECT o."id" AS "organizationId"
          FROM "organizations" o
          JOIN "organization_memberships" m
            ON m."organization_id" = o."id"
          WHERE m."user_id" = ${id}
            AND m."org_role" = 'ORG_ADMIN'
            AND m."valid_until" IS NULL
          ORDER BY o."id"
          FOR UPDATE OF o
        `

        for (const org of orgs) {
          const alternatives = await tx.$queryRaw<Array<{ count: number }>>`
            SELECT COUNT(*)::int AS "count"
            FROM "organization_memberships" m
            JOIN "users" u ON u."id" = m."user_id"
            WHERE m."organization_id" = ${org.organizationId}
              AND m."org_role" = 'ORG_ADMIN'
              AND m."valid_until" IS NULL
              AND m."user_id" <> ${id}
              AND u."is_active" = TRUE
              AND u."is_frozen" = FALSE
              AND (u."expires_at" IS NULL OR u."expires_at" > statement_timestamp())
              AND (u."role" <> 'TEACHER' OR u."teacher_approved" = TRUE)
          `
          if ((alternatives[0]?.count ?? 0) === 0) {
            return { blockedOrganizationId: org.organizationId }
          }
        }

        await tx.user.update({
          where: { id },
          data: {
            isActive: false,
            tokenVersion: { increment: 1 },
          },
        })
        return { blockedOrganizationId: null }
      })

      if (result.blockedOrganizationId) {
        return error(res, '该用户是组织最后一个有效管理员，无法停用', -1, 409)
      }
      return success(res, { id, isActive: false }, '用户已停用，历史身份记录已保留')
    } catch (err) {
      logger.error('停用用户错误', err)
      return error(res, '用户停用失败')
    }
  },
}
