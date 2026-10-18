import {render,screen} from '@testing-library/react'
import {describe,it,expect} from 'vitest'
import {ReadonlyFormAnswer} from './ReadonlyFormAnswer'
const options=[{key:'b',label:'乙选项'},{key:'a',label:'甲选项'}]
describe('typed frozen read-only Form presentation',()=>{
 it('renders rank using frozen labels in accepted order',()=>{
  render(<ReadonlyFormAnswer value={['a','b']} presentation={{type:'RANK_ORDER',options,rows:[]}} />)
  expect(screen.getAllByRole('listitem').map(node=>node.textContent)).toEqual(['甲选项','乙选项'])
 })
 it('renders constant sum zero as zero without synthesizing missing values',()=>{
  const {container}=render(<ReadonlyFormAnswer value={{a:0}} presentation={{type:'CONSTANT_SUM',options,rows:[]}} />)
  expect([...container.querySelectorAll('dd')].map(node=>node.textContent)).toEqual(['—','0'])
 })
 it('renders matrix row labels and persisted state, without leaking hidden row value',()=>{
  const {container}=render(<ReadonlyFormAnswer value={{r1:['a','b'],r2:'secret'}} presentation={{type:'MATRIX_MULTIPLE',options,rows:[{key:'r1',label:'第一行'},{key:'r2',label:'第二行'}]}} rowStates={{r1:'ANSWERED',r2:'NOT_SHOWN'}} />)
  expect(screen.getByText('第二行（未显示）')).toBeTruthy();expect(screen.queryByText('secret')).toBeNull()
  expect([...container.querySelectorAll('dd')].map(node=>node.textContent)).toEqual(['甲选项、乙选项','—'])
 })
 it.each(['REFUSED','SHOWN_MISSING','NOT_SHOWN'])('does not show a value for %s',state=>{
  const {container}=render(<ReadonlyFormAnswer value="secret" state={state} presentation={{type:'LONG_TEXT',options:[],rows:[]}} />)
  expect(container.textContent).toBe('—')
 })
 it('preserves exact long text and negative numeric display',()=>{
  const text='中文, "引用"\n尾';const {rerender,container}=render(<ReadonlyFormAnswer value={text} presentation={{type:'LONG_TEXT',options:[],rows:[]}} />)
  expect(container.textContent).toBe(text);rerender(<ReadonlyFormAnswer value={-2.5} presentation={{type:'NUMBER',options:[],rows:[]}} />);expect(container.textContent).toBe('-2.5')
 })
})
