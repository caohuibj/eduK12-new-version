import {fireEvent,render,screen,waitFor} from '@testing-library/react'
import {beforeEach,expect,it,vi} from 'vitest'
import TrainingCourseCode from './TrainingCourseCode'
const writeText=vi.fn()
beforeEach(()=>{writeText.mockReset();Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText}})})
it('copies only the code on explicit activation and announces success',async()=>{
 writeText.mockResolvedValue(undefined)
 render(<TrainingCourseCode title="合成课程" code="TEST-ONLY" compact/>)
 expect(writeText).not.toHaveBeenCalled()
 fireEvent.click(screen.getByRole('button',{name:'复制「合成课程」课程码'}))
 await waitFor(()=>expect(writeText).toHaveBeenCalledWith('TEST-ONLY'))
 expect(await screen.findByRole('status')).toHaveTextContent('课程码已复制')
})
it('provides manual-copy guidance when clipboard access fails',async()=>{
 writeText.mockRejectedValue(Error('denied'))
 render(<TrainingCourseCode title="合成课程" code="TEST-ONLY"/>)
 fireEvent.click(screen.getByRole('button',{name:'复制「合成课程」课程码'}))
 expect(await screen.findByRole('status')).toHaveTextContent('复制失败，请手动选中课程码')
 expect(screen.getByText('TEST-ONLY')).toBeVisible()
})
