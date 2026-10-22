import { Request, Response, NextFunction } from 'express'
import { verifyToken } from '../utils/jwt'
import { AuthenticatedPrincipal, UserRole } from '../types'
import { unauthorized, forbidden } from '../utils/response'
import { inactiveAccountMessage } from '../utils/accountStatus'
import { getSessionToken, getSchoolSessionToken, getSurveySessionToken, getHuiteacherSessionToken } from '../utils/authCookies'
import { measureRequestPhase } from '../services/runtimeObservability'
import { asBusinessPrincipal, loadCurrentPrincipal, toRequestPrincipal } from '../modules/organization/principal'
import { schoolAccountNeedsMfa } from '../modules/campus/mfa.service'
import { isSessionRevoked } from '../utils/sessionRevocation'
import { needsAdminKey, validAdminProof, ADMIN_STEP_UP_SECONDS } from '../modules/admin-permissions/security'

// Extend Express Request
declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedPrincipal
    }
  }
}

const loadPrincipal = async (userId: string) => {
  return measureRequestPhase('auth_account_lookup', () => loadCurrentPrincipal(userId))
}

const authenticateProduct = async (req: Request, res: Response, next: NextFunction, product: 'LEGACY' | 'SCHOOL' | 'SURVEY' | 'HUITEACHER') => {
  try {
    const token = product === 'SCHOOL' ? getSchoolSessionToken(req) : product === 'HUITEACHER' ? getHuiteacherSessionToken(req) : product === 'SURVEY' ? getSurveySessionToken(req) : getSessionToken(req)
    if (!token) {
      return unauthorized(res, '缺少认证令牌')
    }

    const payload = verifyToken(token)

    if (!payload) {
      return unauthorized(res, '无效的认证令牌')
    }

    const revoked = await isSessionRevoked(token)
    if (revoked === true) return unauthorized(res, '当前会话已退出，请重新登录')
    if (revoked === null && process.env.NODE_ENV === 'production') {
      return res.status(503).json({ code: -1, message: '会话状态暂不可用，请稍后重试' })
    }

    const principal = await loadPrincipal(payload.userId)
    const rejection = inactiveAccountMessage(principal)
    if (rejection) {
      return unauthorized(res, rejection)
    }

    if (payload.tokenVersion !== principal!.tokenVersion) {
      return unauthorized(res, '认证令牌已失效，请重新登录')
    }
    const management = needsAdminKey(principal!) && ['LEGACY','TRAINING'].includes(principal!.accountDomain)
    if (management && !validAdminProof(payload)) return unauthorized(res, '请完成管理员双因素登录')

    // A domain mismatch cannot be fixed by a client-supplied hostname or
    // JWT role. Historical JWTs without an audience remain legacy-only.
    if (product === 'SCHOOL'
      ? principal!.accountDomain !== 'SCHOOL' || payload.accountDomain !== 'SCHOOL' || payload.sessionProduct === 'HUITEACHER'
      : product === 'HUITEACHER'
        ? principal!.accountDomain !== 'SCHOOL' || payload.accountDomain !== 'SCHOOL' || payload.sessionProduct !== 'HUITEACHER'
      : product === 'SURVEY'
        ? principal!.accountDomain !== 'SURVEY' || payload.accountDomain !== 'SURVEY'
        : !['LEGACY', 'TRAINING'].includes(principal!.accountDomain)
          || (payload.accountDomain !== undefined && !['LEGACY', 'TRAINING'].includes(payload.accountDomain))) {
      return unauthorized(res, '账号不属于当前产品')
    }

    // Role elevation invalidates password-only SCHOOL sessions immediately.
    if ((product === 'SCHOOL' || product === 'HUITEACHER') && await schoolAccountNeedsMfa(principal!.userId)
      && (!payload.mfaVerifiedAt || payload.mfaVerifiedAt > Date.now()/1000)) {
      return unauthorized(res, '需要完成双因素认证')
    }

    if (product === 'SURVEY') {
      const now = Math.floor(Date.now() / 1000)
      if (!payload.mfaVerifiedAt || payload.mfaVerifiedAt > now || now - payload.mfaVerifiedAt > 7 * 86400) {
        return unauthorized(res, '请完成 Survey 双因素认证')
      }
      const surveyGrant = await import('../modules/survey/authority')
      if (!await surveyGrant.isActiveResearcher(principal!.userId)) {
        return forbidden(res, '研究者资格不可用')
      }
    }

    // JWT proves possession of a session credential. Current database state is
    // authoritative for every mutable authorization attribute, including the
    // legacy role and the independent platform role.
    req.user = toRequestPrincipal(principal!)
    req.user.adminVerifiedAt = payload.adminVerifiedAt
    req.user.adminSessionId = payload.adminSessionId
    // The view header selects only the current DB business identity. It never
    // supplies a role, grant or authentication proof. No header preserves the
    // existing management compatibility contract for older clients/workers.
    if(product==='LEGACY'&&req.get('X-EduK12-Account-View')==='BUSINESS'){
      const business=asBusinessPrincipal(req.user)
      if(!business)return forbidden(res,'当前账号没有可用的业务身份')
      req.user=business
    }
    // Key ceremonies must remain reachable to renew an otherwise valid admin
    // session. Sensitive governance writes cannot fall back to password-only.
    if (management && !['GET','HEAD','OPTIONS'].includes(req.method)
      && !req.originalUrl.startsWith('/api/admin/security/')
      && req.originalUrl.split('?')[0]!=='/api/auth/logout'
      && (principal!.platformRole === 'SYSTEM_ADMIN' || /^\/api\/(platform\/|users(?:\/|$)|admin\/permissions(?:\/|$)|auth\/(change-password|extend-account))/.test(req.originalUrl))
      && !validAdminProof(payload, ADMIN_STEP_UP_SECONDS)) {
      return res.status(403).json({ code: 'ADMIN_KEY_STEP_UP_REQUIRED', message: '敏感操作需要重新完成管理员双因素验证' })
    }

    const allowedWhileChangingPassword = new Set([
      '/api/auth/me',
      '/api/auth/change-password',
      '/api/users/change-password',
      '/api/auth/logout',
      '/api/auth/csrf',
      '/api/admin/security/step-up/options',
      '/api/admin/security/step-up/verify',
      '/api/admin/security/totp/step-up/verify',
      '/api/campus/auth/me',
      '/api/campus/auth/logout',
      '/api/huiteacher/auth/me',
      '/api/huiteacher/auth/logout',
      '/api/survey/auth/me',
      '/api/survey/auth/logout',
      '/api/campus/auth/change-password',
      '/api/survey/auth/change-password',
      '/api/huiteacher/auth/change-password',
    ])
    if (
      principal!.mustChangePassword &&
      !allowedWhileChangingPassword.has(req.originalUrl.split('?')[0])
    ) {
      return forbidden(res, '首次登录必须先修改密码')
    }
    next()
  } catch (err) {
    next(err)
  }
}

export const authenticate = (req: Request, res: Response, next: NextFunction) => authenticateProduct(req, res, next, 'LEGACY')
export const authenticateSurvey = (req: Request, res: Response, next: NextFunction) => authenticateProduct(req, res, next, 'SURVEY')
export const authenticateSchool = (req: Request, res: Response, next: NextFunction) => authenticateProduct(req, res, next, 'SCHOOL')
export const authenticateHuiteacher = (req: Request, res: Response, next: NextFunction) => authenticateProduct(req, res, next, 'HUITEACHER')

// 可选认证中间件 - 有有效且未停用的 token 才挂上当前数据库 principal；公开入口不因冻结账号 401。
export const optionalAuthenticate = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const token = getSessionToken(req)
    if (token) {
      const payload = verifyToken(token)

      if (payload) {
        const revoked = await isSessionRevoked(token)
        if (revoked === null && process.env.NODE_ENV === 'production') {
          return res.status(503).json({ code: -1, message: '会话状态暂不可用，请稍后重试' })
        }
        if (revoked !== true) {
          const principal = await loadPrincipal(payload.userId)
          if (!inactiveAccountMessage(principal) && payload.tokenVersion === principal!.tokenVersion && ['LEGACY','TRAINING'].includes(principal!.accountDomain) && (payload.accountDomain === undefined || ['LEGACY','TRAINING'].includes(payload.accountDomain))
            && (!needsAdminKey(principal!) || validAdminProof(payload))) {
            req.user = toRequestPrincipal(principal!)
            if(req.get('X-EduK12-Account-View')==='BUSINESS')req.user=asBusinessPrincipal(req.user)??undefined
          }
        }
      }
    }

    next()
  } catch (err) {
    next(err)
  }
}

// Legacy product authorization only. Organization routes must use the
// OrganizationAccessContext guards and must never use this role helper.
export const requireRole = (...roles: UserRole[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return unauthorized(res)
    }

    if (!roles.includes(req.user.role)) {
      return forbidden(res, '需要特定权限')
    }

    next()
  }
}

export const requireAdmin = requireRole(UserRole.ADMIN)
export const requireTeacher = requireRole(UserRole.TEACHER, UserRole.ADMIN)
export const requireBusinessRole = (...roles:UserRole[]) => (req:Request,res:Response,next:NextFunction)=>{
  if(!req.user)return unauthorized(res)
  const business=asBusinessPrincipal(req.user)
  if(!business||!roles.includes(business.role))return forbidden(res,'需要对应的业务身份')
  req.user=business
  next()
}
export const requireStudent = requireBusinessRole(UserRole.STUDENT)

/** Allow a user to access only their own record, unless they are a legacy admin. */
export const requireSelfOrAdmin = (req: Request, res: Response, next: NextFunction) => {
  if (!req.user) {
    return unauthorized(res)
  }

  if (req.user.role !== UserRole.ADMIN && req.user.userId !== req.params.id) {
    return forbidden(res, '无权限查看此用户')
  }

  next()
}
