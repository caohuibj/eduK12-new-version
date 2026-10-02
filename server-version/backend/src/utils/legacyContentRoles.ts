import { UserRole } from '@prisma/client'
/** Legacy content APIs have no parent projection contract. New roles fail closed. */
export const canReadLegacyContent = (role: unknown): boolean =>
  role === UserRole.ADMIN || role === UserRole.TEACHER || role === UserRole.STUDENT
