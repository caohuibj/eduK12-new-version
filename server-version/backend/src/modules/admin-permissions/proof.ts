// Trusted request claims are hydrated only after JWT/session/account checks.
export const ADMIN_SESSION_SECONDS = 8 * 3600
export const ADMIN_STEP_UP_SECONDS = 300
export type AdminAuthenticationMethod = 'TOTP' | 'SECURITY_KEY'
type AdminProof = { adminVerifiedAt?: number; adminSessionId?: string; adminAuthenticationMethod?: AdminAuthenticationMethod }
export type AdminSessionProof = AdminProof & { tokenVersion: number }
export const adminRequiresTotp = () => process.env.ADMIN_REQUIRE_TOTP === 'true'
export function needsAdminKey(principal: { platformRole: string; entryGrants?: unknown[] }) {
  return principal.platformRole === 'SYSTEM_ADMIN' || Boolean(principal.entryGrants?.length)
}
export function validAdminProof(claims: AdminProof, maxAge = ADMIN_SESSION_SECONDS) {
  const age = Date.now() / 1000 - (claims.adminVerifiedAt ?? 0)
  return Boolean(claims.adminSessionId && Number.isFinite(age) && age >= 0 && age <= maxAge
    && (!adminRequiresTotp() || claims.adminAuthenticationMethod === 'TOTP'))
}
