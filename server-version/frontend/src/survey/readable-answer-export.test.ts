import {describe,expect,it} from 'vitest'
import {readableAnswerCsv} from './readable-answer-export'
const header=['research_code_or_attempt','variable_code','value','missing_reason','final_completed_at_utc']
const csv=(rows:string[][])=>[header,...rows].map(row=>row.map(value=>'"'+value.replace(/"/g,'""')+'"').join(',')).join('\r\n')+'\r\n'
const variable=(columnKey:string,responseType='LIKERT')=>({columnKey,title:'学习体验',prompt:'我能保持专注。',responseType,
  options:[{code:'o1',label:'非常不同意'},{code:'o2',label:'非常同意'}]})
const row=(key:string,value:string,reason='')=>['A-TEST',key,value,reason,'2026-10-23T15:58:23.128Z']
describe('readable participant answer export',()=>{
  it('shows Chinese questions, labels, stable anonymous identifiers and explicit UTC time',()=>{
    const result=readableAnswerCsv(csv([row('q1','o2')]),[variable('q1')])
    expect(result).toContain('"匿名答卷编号","最近提交时间（UTC）","我能保持专注。"')
    expect(result).toContain('"A-TEST","2026-10-23T15:58:23.128Z","非常同意"')
    expect(result).not.toContain('"o2"')
  })
  it('decodes multi-select, ranking and number allocations using the same frozen question options',()=>{
    const book=[variable('multi','MULTIPLE'),variable('rank','RANK_ORDER'),variable('sum','CONSTANT_SUM')]
    const result=readableAnswerCsv(csv([row('multi','["o2","o1"]'),row('rank','["o2","o1"]'),row('sum','{"o1":40,"o2":60}')]),book)
    expect(result).toContain('非常同意；非常不同意')
    expect(result).toContain('1. 非常同意；2. 非常不同意')
    expect(result).toContain('非常不同意：40；非常同意：60')
  })
  it('retains Chinese text, embedded quotes, line breaks, commas, empty values and numeric-looking strings',()=>{
    const values=['中文，"引号"\r\n下一行 🌱','0007','']
    const book=values.map((_,index)=>({...variable('text'+index,'SHORT_TEXT'),options:[]}))
    const result=readableAnswerCsv('\uFEFF'+csv(values.map((value,index)=>row('text'+index,value))),book)
    expect(result).toContain('"中文，""引号""\r\n下一行 🌱"')
    expect(result).toContain('"0007"')
    expect(result).toContain('"0007",""')
  })
  it('protects formula-like questions and option labels without stripping the original free-text guard',()=>{
    const book=[{...variable('q'),title:'=FORMULA',prompt:' +PROMPT',options:[{code:'=code',label:'@OPTION'}]},
      {...variable('text','SHORT_TEXT'),options:[]}]
    const result=readableAnswerCsv(csv([row('q',"'=code"),row('text',"'+原样保留")]),book)
    expect(result).toContain('"\' +PROMPT"')
    expect(result).toContain('"\'@OPTION"')
    expect(result).toContain('"\'+原样保留"')
    expect(result).not.toContain("''+原样保留")
  })
  it('explains refused and unshown answers without fabricating a selected option',()=>{
    const result=readableAnswerCsv(csv([row('q','', 'REFUSED'),['A-OTHER',...row('q','', 'NOT_SHOWN').slice(1)]]),[variable('q')])
    expect(result).toContain('"不愿回答"')
    expect(result).toContain('"未呈现"')
  })
  it('pivots multiple participants into separate rows without mixing answers or dropping unobserved question columns',()=>{
    const book=[{...variable('q1'),prompt:'题目一'},{...variable('q2'),prompt:'题目二'},{...variable('q3'),prompt:'题目三'}]
    const result=readableAnswerCsv(csv([row('q1','o2'),['A-OTHER',...row('q1','o1').slice(1)],row('q2','o1')]),book)
    const lines=result.trim().split('\r\n')
    expect(lines).toHaveLength(3)
    expect(lines[0]).toBe('"匿名答卷编号","最近提交时间（UTC）","题目一","题目二","题目三"')
    expect(lines[1]).toBe('"A-TEST","2026-10-23T15:58:23.128Z","非常同意","非常不同意",""')
    expect(lines[2]).toBe('"A-OTHER","2026-10-23T15:58:23.128Z","非常不同意","",""')
  })
  it('keeps repeated Chinese prompts in distinct, readable columns, including different waves and versions',()=>{
    const book=[{...variable('q1'),title:'第一部分',waveOrdinal:1,publicationVersion:1},
      {...variable('q2'),title:'第二部分',waveOrdinal:1,publicationVersion:1},
      {...variable('q3'),title:'第二部分',waveOrdinal:2,publicationVersion:1}]
    const result=readableAnswerCsv(csv([row('q1','o2'),row('q2','o1'),row('q3','o2')]),book)
    expect(result).toContain('我能保持专注。（第一部分 · 第 1 轮 · 版本 1）')
    expect(result).toContain('我能保持专注。（第二部分 · 第 1 轮 · 版本 1）')
    expect(result).toContain('我能保持专注。（第二部分 · 第 2 轮 · 版本 1）')
    expect(result).toContain('"非常同意","非常不同意","非常同意"')
  })
  it('rejects duplicate participant-question values instead of silently overwriting a response',()=>{
    expect(()=>readableAnswerCsv(csv([row('q','o2'),row('q','o1')]),[variable('q')])).toThrow(/重复记录/)
  })
  it('keeps column labels distinct after spreadsheet formula protection is applied',()=>{
    const book=[{...variable('q1'),prompt:'+题目'},{...variable('q2'),prompt:"'+题目"}]
    const result=readableAnswerCsv(csv([row('q1','o1'),row('q2','o2')]),book)
    expect(result).toContain('"\'+题目","\'+题目（学习体验）"')
  })
  it.each([
    ['unknown variable',csv([row('missing','o1')]),[variable('q')]],
    ['unknown choice',csv([row('q','unknown')]),[variable('q')]],
    ['duplicate dictionary',csv([row('q','o1')]),[variable('q'),variable('q')]],
    ['malformed quoted CSV','"research_code_or_attempt',[]],
    ['malformed multi-selection',csv([row('q','[1]')]),[variable('q','MULTIPLE')]],
    ['wrong format','"trial","value"\r\n"1","a"\r\n',[]],
  ])('refuses %s rather than exporting a guessed answer',(_name,data,book)=>{
    expect(()=>readableAnswerCsv(data as string,book)).toThrow()
  })
})
