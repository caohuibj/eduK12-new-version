/**
 * Compile-time bank registry for the production dist-only backend image.
 * Keep in sync with task-package.json banks (asserted by bank-meta.test.ts).
 * No production file-system reads or ad hoc dynamic TS imports.
 */
import type { CognitiveBankMeta } from './bank-meta'
import { bankMeta as icarmatrixV1 } from '../tasks/icarmatrix/generator'
import { bankMeta as icarmatrixV2 } from '../tasks/icarmatrix/generator-v2'
import { bankMeta as cogestBank } from '../tasks/cogest/bank'
import { bankMeta as logicdeduceBank } from '../tasks/logicdeduce/bank'
import { bankMeta as proofreadBank } from '../tasks/proofread/bank'
import { bankMeta as readingcompBank } from '../tasks/readingcomp/bank'
import { bankMeta as semanticfluencyBank } from '../tasks/semanticfluency/bank'
import { bankMeta as seriescompleteBank } from '../tasks/seriescomplete/bank'
import { bankMeta as wordanalogyBank } from '../tasks/wordanalogy/bank'
import { bankMeta as wordmeaningBank } from '../tasks/wordmeaning/bank'
import { bankMeta as wordproblemBank } from '../tasks/wordproblem/bank'

export const COGNITIVE_BANK_REGISTRY: Readonly<Record<string, readonly CognitiveBankMeta[]>> = {
  icarmatrix: [icarmatrixV1, icarmatrixV2],
  cogest: [cogestBank],
  logicdeduce: [logicdeduceBank],
  proofread: [proofreadBank],
  readingcomp: [readingcompBank],
  semanticfluency: [semanticfluencyBank],
  seriescomplete: [seriescompleteBank],
  wordanalogy: [wordanalogyBank],
  wordmeaning: [wordmeaningBank],
  wordproblem: [wordproblemBank],
}
