import React from 'react'
import { createRoot } from 'react-dom/client'
import { VoiceEmotionTask } from '../../../../../../server-version/frontend/src/modules/cognitive/tasks/voice-emotion-cues/VoiceEmotionTask'
import { config, PROTOCOL, IDENTITY, manifest } from '../../../../../../server-version/frontend/src/modules/cognitive/tasks/voice-emotion-cues/generated/protocol'
import { digest, type Context, type Ports, type Draft } from '../../../../../../server-version/frontend/src/modules/cognitive/tasks/voice-emotion-cues/contracts'
const c = config('experience'), seed = 'native-audio-browser-synthetic', plans = manifest(c, seed)
const context: Context = { contextKey: 'isolated-native-audio-preview', language: location.pathname.includes('/en') ? 'en' : 'zh', randomSeed: seed, snapshot: { schemaVersion: 1, ...IDENTITY, frozenAt: '2026-10-27T00:00:00.000Z', config: c, protocol: PROTOCOL, configHash: digest(c), protocolSignature: digest(PROTOCOL) }, manifestHash: digest(plans) }
const records: Draft[] = []
const ports: Ports = {
  prepareLocalAttempt: async (context, plans, realm) => ({ prepared: true, exclusive: true, contextKey: context.contextKey, bindingDigest: digest({ context, plans, realm }) }),
  persistLocalDraft: async d => { records.push(structuredClone(d)); return { retained: true, contextKey: d.contextKey, recordKey: d.recordKey, recordDigest: d.recordDigest } },
  finalize: async () => { throw Error('Synthetic preview has no product API or durable final port') },
}
Object.assign(window, { voicePreview: { records, plans, context, syntheticMemoryPorts: true } })
createRoot(document.getElementById('root')!).render(<React.StrictMode><VoiceEmotionTask context={context} ports={ports} language={context.language} /></React.StrictMode>)
