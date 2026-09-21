import { Prisma, type PrismaClient } from '@prisma/client'

/** Retry whole transactions; no partial freeze/install can escape a serialization conflict. */
export const withSerializableScaleTransaction = async <T>(db: PrismaClient, work: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> => {
  for (let attempt = 0; ; attempt += 1) {
    try { return await db.$transaction(work, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }) }
    catch (error) {
      const failure = error as { code?: string; meta?: { code?: string } }
      const retryable = failure.code === 'P2034' || (failure.code === 'P2010' && failure.meta?.code === '40001')
      if (!retryable || attempt >= 3) throw error
      await new Promise(resolve => setTimeout(resolve, 10 * (attempt + 1)))
    }
  }
}
