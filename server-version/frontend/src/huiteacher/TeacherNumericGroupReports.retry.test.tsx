import {fireEvent,render,screen,waitFor} from '@testing-library/react'
import {expect,it,vi} from 'vitest'
import {TeacherNumericGroupReports} from './TeacherNumericGroupReports'
it('retries an initial directory failure in place using GET only',async()=>{
 const api=vi.fn().mockRejectedValueOnce(new Error('temporary directory failure'))
  .mockResolvedValue({sources:[],specs:[],versions:[],canGenerate:false})
 render(<TeacherNumericGroupReports api={api} endpoint="/reports"/>)
 fireEvent.click(screen.getByRole('button',{name:'查看数值群体报告'}))
 expect(await screen.findByRole('alert')).toHaveTextContent('temporary directory failure')
 fireEvent.click(screen.getByRole('button',{name:'重试读取数值报告目录'}))
 await screen.findByLabelText('已生成数值报告')
 await waitFor(()=>expect(screen.queryByRole('alert')).toBeNull())
 expect(api.mock.calls.map(([path])=>path)).toEqual(['/reports','/reports','/reports?configure=true'])
 expect(api.mock.calls.every(([,method])=>!method)).toBe(true)
})
