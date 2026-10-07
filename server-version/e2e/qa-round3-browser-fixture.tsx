import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import FinalCompositeAssessment from '../frontend/src/components/FinalCompositeAssessment'
import ScaleEdit from '../frontend/src/pages/ScaleEdit'
import ScaleList from '../frontend/src/pages/ScaleList'
import { AuthProvider } from '../frontend/src/contexts/AuthContext'
import CognitiveAssignmentEdit from '../frontend/src/pages/teacher/CognitiveAssignmentEdit'
import { ReactionFrameTask } from '../frontend/src/modules/cognitive/tasks/reaction/ReactionFrameTask'
import ReportingContent from '../frontend/src/pages/admin/ReportingContent'

const fixture = JSON.parse(document.getElementById('fixture')!.textContent!)
function Draft() {
  const [exited, setExited] = useState(false)
  return exited ? <button onClick={() => setExited(false)}>恢复草稿</button> : <FinalCompositeAssessment
    state={fixture.attempt} onExit={() => setExited(true)} onCompleted={() => undefined}
    onReload={async () => undefined} onEnterCognitive={() => undefined} onEnterSituational={() => undefined}
    submitScale={async () => ({ code: 0, message: 'ok', data: null })}
    submitFormSection={async () => ({ code: 0, message: 'ok', data: null })}
  />
}
const mode = new URLSearchParams(location.search).get('mode')
const component = mode === 'draft' ? <Draft /> : mode === 'reaction'
  ? <ReactionFrameTask taskContext={{ sessionId: 'r3-local-reaction', testType: 'reaction', engineVersion: '1.0.0', scoringVersion: '1.1.0', configVersion: '1.2.0', attemptNo: 1, randomSeed: 'r3-local-seed', config: { totalTrials: 20, readyDurationMs: 100, foreperiodMinMs: 200, foreperiodMaxMs: 300, timeoutMs: 2000 } }} trialIndex={0} onTrialComplete={async () => undefined} />
  : <MemoryRouter initialEntries={[mode === 'content' ? '/admin/reporting-content' : mode === 'cognitive' ? '/cognitive/source' : mode === 'scale-export' ? '/scales' : '/scales/scale-1']}><Routes>
    <Route path="/admin/reporting-content" element={<AuthProvider><ReportingContent /></AuthProvider>} />
    <Route path="/scales" element={<AuthProvider><ScaleList /></AuthProvider>} />
    <Route path="/scales/:id" element={<ScaleEdit />} /><Route path="/cognitive/:id" element={<CognitiveAssignmentEdit />} />
  </Routes></MemoryRouter>
createRoot(document.getElementById('root')!).render(component)
