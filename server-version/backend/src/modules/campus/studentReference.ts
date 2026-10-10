import { createHmac } from 'node:crypto'

/** School-scoped reference, deliberately unrelated to username or student number.
 * Domain separation prevents using a visible report code as an eligibility oracle.
 * The HMAC key is the existing required SCHOOL admission secret; changing it
 * requires an explicit reference migration plan, not silent rotation.
 */
export function campusStudentReference(organizationId: string, studentUserId: string): string {
  const key = process.env.CAMPUS_ELIGIBILITY_HMAC_KEY
  if (!key || !/^[a-fA-F0-9]{64}$/.test(key)) throw new Error('CAMPUS_REFERENCE_KEY_UNAVAILABLE')
  const digest = createHmac('sha256', Buffer.from(key, 'hex'))
    .update('HUISCHOOL:STUDENT_REFERENCE:v1\0')
    .update(organizationId).update('\0').update(studentUserId)
    .digest('hex').slice(0, 12).toUpperCase()
  return '林-' + digest
}
