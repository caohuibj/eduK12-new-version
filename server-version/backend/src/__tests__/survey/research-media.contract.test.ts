import { describe,it,expect } from 'vitest'
import { formDraftSchema,sjtDraftSchema,validateSurveyDraft } from '../../modules/survey/builder.definition'
import { surveyImageRefs } from '../../modules/survey/media.references'

const image={asset:{
  assetId:'198e278f-f993-44fa-9eaa-223693fa4db3',
  contentHash:'a'.repeat(64),
  mimeType:'image/png' as const,
},altText:'同学们坐在课堂围桌讨论',
  rightsStatus:'self_authored' as const,
  rightsNote:'研究者原创图片，不包含识别个人的真实影像'}
const form={schemaVersion:1 as const,pages:[{pageKey:'first',title:'首页',questions:[{
  itemKey:'subject',type:'SINGLE' as const,prompt:'学习科目',required:true,
  options:[{optionKey:'math',label:'数学'},{optionKey:'chemistry',label:'化学'}],rows:[],image,
}]}]}
const sjt={schemaVersion:1 as const,respondentType:'student_self_report' as const,
  scenarioKey:'classroom',title:'合作学习',stimulus:'学习中如何与同学交流',
  author:'作者本人',sourceNote:'研究原创',licenseStatus:'self_authored' as const,
  redistribution:'allowed' as const,
  image,metrics:[{metricKey:'effort',label:'投入',direction:'descriptive' as const}],
  questions:[
    {questionKey:'first',prompt:'你首先怎么做？',options:[
      {optionKey:'a',label:'参与',contributions:{effort:1}},
      {optionKey:'b',label:'先听',contributions:{effort:0}},
    ]},
    {questionKey:'second',prompt:'后来又怎么做？',options:[
      {optionKey:'a',label:'询问',contributions:{effort:2}},
      {optionKey:'b',label:'离开',contributions:{effort:0}},
    ]},
  ],
}
describe('Survey verified static media contracts',()=>{
  it('round-trips image identity/alt/copyright and discovers only frozen Form/SJT references',()=>{
    const f=formDraftSchema.parse(form),s=sjtDraftSchema.parse(sjt)
    expect(validateSurveyDraft('FORM',f,true).issues).toHaveLength(0)
    expect(validateSurveyDraft('SJT',s,true).issues).toHaveLength(0)
    const found=surveyImageRefs([{kind:'FORM',definition:f},{kind:'SJT',definition:s}])
    expect(found).toHaveLength(2)
    expect(found.every(x=>x.asset.contentHash==='a'.repeat(64))).toBe(true)
  })
  it('blocks missing alt text, unverifiable rights, unsupported or remote assets',()=>{
    const noRights=structuredClone(form)
    noRights.pages[0].questions[0].image.rightsStatus='unknown' as never
    expect(validateSurveyDraft('FORM',noRights,true).issues.some(x=>x.path.includes('.image'))).toBe(true)
    for(const assetId of ['https://example.test/image.png','data:image/png;base64,XX','/etc/passwd']){
      const poisoned=structuredClone(form)
      poisoned.pages[0].questions[0].image.asset.assetId=assetId
      expect(formDraftSchema.safeParse(poisoned).success).toBe(false)
    }
    const noAlt=structuredClone(form)
    noAlt.pages[0].questions[0].image.altText=''
    expect(formDraftSchema.safeParse(noAlt).success).toBe(false)
    const mime=structuredClone(form)
    mime.pages[0].questions[0].image.asset.mimeType='image/svg+xml' as never
    expect(formDraftSchema.safeParse(mime).success).toBe(false)
  })
})
