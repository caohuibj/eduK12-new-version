import type { RunAttemptIdentityBinding } from './startAdmission'

export interface RunRuntimeBinding {
  runtimeBindingKind: string
  runtimeBindingRef: string
}

export interface RunRuntimeStartInput {
  operationKey: string
  runtimeTargetRef: string
  respondentUserId: string
  attemptIdentity: RunAttemptIdentityBinding
  executionId: string
}

/**
 * External runtime adapters are allowed only when operationKey is an authoritative
 * idempotency identity and lookup can recover the result of an ambiguous call.
 * Production PR2 uses the stronger DB-transactional Composite adapter instead.
 */
export interface ExternalRunRuntimeAdapter {
  runtimeBindingKind: string
  startWithOperationKey(input: RunRuntimeStartInput): Promise<RunRuntimeBinding>
  lookupByOperationKey(operationKey: string): Promise<RunRuntimeBinding | null>
  cancelByOperationKey?(operationKey: string): Promise<'CANCELLED' | 'ALREADY_COMPLETED' | 'NOT_FOUND' | 'UNKNOWN'>
}

export class RunRuntimeAdapterRegistry {
  private readonly externalByKind = new Map<string, ExternalRunRuntimeAdapter>()

  constructor(adapters: ExternalRunRuntimeAdapter[] = []) {
    for (const adapter of adapters) {
      if (!adapter.runtimeBindingKind.trim()) throw new Error('runtime adapter binding kind is required')
      if (this.externalByKind.has(adapter.runtimeBindingKind)) {
        throw new Error(`duplicate runtime adapter: ${adapter.runtimeBindingKind}`)
      }
      this.externalByKind.set(adapter.runtimeBindingKind, adapter)
    }
  }

  externalFor(kind: string): ExternalRunRuntimeAdapter | null {
    return this.externalByKind.get(kind) ?? null
  }
}

export const productionRunRuntimeAdapterRegistry = new RunRuntimeAdapterRegistry()
