import { beforeEach, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
const mocks=vi.hoisted(()=>({getAssignment:vi.fn(),createSession:vi.fn()}))
vi.mock('../api',()=>({cognitiveApi:mocks}))
vi.mock('../../../contexts/CapabilitiesContext',()=>({useCognitiveEnabled:()=>false}))
vi.mock('../core/session-ledger',()=>({readAssignmentSessionId:()=> 'local-stale',readSessionLedger:()=>({status:'IN_PROGRESS'}),writeAssignmentSessionId:vi.fn(),writeSessionLedger:vi.fn()}))
import CognitiveAssignmentEntry from '../pages/CognitiveAssignmentEntry'
beforeEach(()=>{vi.clearAllMocks()})
const mount=()=>render(<MemoryRouter initialEntries={['/assignments/source']}><Routes><Route path="/assignments/:assignmentId" element={<CognitiveAssignmentEntry/>}/></Routes></MemoryRouter>)
it('OFF server-paused shell cannot use a local ledger as resume authority',async()=>{
 mocks.getAssignment.mockResolvedValue({code:0,data:{id:'source',title:'旧任务',admissionPaused:true,continueHref:null,remainingAttempts:2}})
 mount();expect(await screen.findByRole('status')).toHaveTextContent('重新开放后可继续原记录')
 expect(screen.getByRole('button',{name:/继续/})).toBeDisabled();expect(mocks.createSession).not.toHaveBeenCalled()
})
it('OFF uses the server-authorized existing resume link',async()=>{
 mocks.getAssignment.mockResolvedValue({code:0,data:{id:'source',title:'旧任务',admissionPaused:false,continueHref:'/student/cognitive/sessions/accepted',remainingAttempts:2}})
 mount();expect(await screen.findByRole('button',{name:'继续已有作答'})).toBeEnabled()
})
