import { AsyncLocalStorage } from 'node:async_hooks'
import type { Prisma } from '@prisma/client'
import { prisma } from '../config/database'

const scope = new AsyncLocalStorage<Prisma.TransactionClient>()

/**
 * Restricted to the legacy questionnaire authoring controllers and section
 * service. Runtime reads outside this scope use the ordinary Prisma client.
 * Nested authoring transactions join the outer transaction and row lock.
 */
export const legacyQuestionnaireDb: typeof prisma = new Proxy(prisma, {
  get(target, property) {
    const tx = scope.getStore()
    if (tx && property === '$transaction') {
      return (operation: ((db: Prisma.TransactionClient) => unknown) | Promise<unknown>[]) =>
        typeof operation === 'function' ? operation(tx) : Promise.all(operation)
    }
    const db = tx ?? target
    const value = Reflect.get(db, property)
    return typeof value === 'function' ? value.bind(db) : value
  },
})

export const inLegacyQuestionnaireTransaction = <T>(
  tx: Prisma.TransactionClient, operation: () => Promise<T>,
): Promise<T> => scope.run(tx, operation)
