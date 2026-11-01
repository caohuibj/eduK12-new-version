import {afterEach,it,expect} from 'vitest'
import {cleanup,render,screen} from '@testing-library/react'
import {BundleDerivedReport,isDerivedBundleView} from './BundleDerivedReport'
import {derivedViewFixture} from './BundleDerivedReport.fixture'
afterEach(cleanup)
it('renders eight named original means and a separate NFC sum using the shared range component',()=>{
 const view=derivedViewFixture();render(<BundleDerivedReport view={view}/>)
 expect(screen.getAllByRole('img')).toHaveLength(9)
 expect(screen.getByRole('img',{name:'带领与影响，范围 1 到 5，本次结果 3'})).toBeInTheDocument()
 expect(screen.getByRole('img',{name:'认知需求，范围 10 到 50，本次结果 38'})).toBeInTheDocument()
 expect(screen.getAllByRole('heading',{level:4}).map(h=>h.textContent)).toEqual(view.rows.map(r=>r.label))
 expect(screen.getByText('时间范围：通常的自我感受')).toBeInTheDocument()
 expect(screen.getByText(/本次最高方向：组织与安排、艺术与创作/)).toBeInTheDocument()
})
it('uses the frozen maximum set without independently comparing or rounding numerical rows',()=>{
 const view=derivedViewFixture();view.rows[0].value=5
 render(<BundleDerivedReport view={view}/>)
 expect(screen.getByText(/本次最高方向：组织与安排、艺术与创作/)).toBeInTheDocument()
 expect(screen.queryByText(/本次最高方向：带领与影响/)).not.toBeInTheDocument()
})
it('distinguishes genuine zero, missing, invalid and withheld rows without inventing values',()=>{
 const view=derivedViewFixture();view.maxSets=[];view.blocks=[{...view.blocks[0],maxSetKeys:[],rowKeys:view.rows.slice(0,4).map(r=>r.rowKey)}]
 Object.assign(view.rows[0],{value:0,unit:'count',range:{min:0,max:10},denominator:0})
 Object.assign(view.rows[1],{state:'missing',value:null});Object.assign(view.rows[2],{state:'invalid',value:null});Object.assign(view.rows[3],{state:'redacted',value:null})
 const {container}=render(<BundleDerivedReport view={view}/>)
 expect(screen.getByRole('img',{name:'带领与影响，范围 0 到 10，本次结果 0'})).toBeInTheDocument()
 expect(screen.getByText(/有效分母：0/)).toBeInTheDocument()
 expect(screen.getAllByText('暂无结果').length).toBeGreaterThan(0);expect(screen.getAllByText('结果无效').length).toBeGreaterThan(0);expect(screen.getAllByText('当前未开放').length).toBeGreaterThan(0)
 expect(container.querySelectorAll('.report-range__marker')).toHaveLength(1)
})
it('refuses malformed transport DTOs and renders original narrative as text',()=>{
 const view=derivedViewFixture();view.conclusions[0].text='<script>doSomething()</script>'
 const {container}=render(<BundleDerivedReport view={view}/>)
 expect(screen.getByText('<script>doSomething()</script>')).toBeInTheDocument();expect(container.querySelector('script')).toBeNull()
 const invalid=structuredClone(view);invalid.rows[0].value=Number.NaN;expect(isDerivedBundleView(invalid)).toBe(false)
 invalid.rows[0].value=null;invalid.rows[0].state='redacted';invalid.maxSets[0].state='redacted';expect(isDerivedBundleView(invalid)).toBe(false)
})
