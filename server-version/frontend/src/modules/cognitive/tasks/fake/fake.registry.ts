import { FakeTask } from './FakeTask'
import type { CognitiveFrontendRegistryEntry } from '../../registry'

/** Fake Test 前端注册条目：testType=fake，engineVersion=1.0.0（与后端 registry key 对齐）。 */
export const fakeRegistryEntry: CognitiveFrontendRegistryEntry = {
  testType: 'fake',
  engineVersion: '1.0.0',
  RunnerComponent: FakeTask,
}
