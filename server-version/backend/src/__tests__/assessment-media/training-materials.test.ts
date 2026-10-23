import {describe,it,expect,vi,beforeEach} from 'vitest'
const mocks=vi.hoisted(()=>({lock:vi.fn()}))
vi.mock('../../services/assetStorage',()=>({lockStoredAssetRows:mocks.lock}))
import {assertTrainingMaterialsUsable,authorizedTrainingMaterial} from '../../modules/assessment-media/training-materials'
import {scaleStimulusMaterialReferences,scaleReportMaterialReferences,scaleAssessmentMediaReferences} from '../../modules/scale/scale-image-retention'
import {compositeFormSectionMaterialReferences,frozenFormSectionMediaReferences} from '../../modules/assessment-runtime/form-image.adapter'
import {runnerDefinition} from '../../modules/scale/scale-definition'
import {projectRawScoreFeedback} from '../../modules/scale/raw-score-feedback'
import {publicTrainingFormDefinition} from '../../modules/assessment-runtime/typed-form'
const item={asset:{assetId:'198e278f-f993-44fa-9eaa-223693fa4db3',contentHash:'a'.repeat(64),mimeType:'application/pdf' as const},name:'说明',rightsStatus:'authorized' as const,rightsNote:'私有使用依据'}
const asset={id:item.asset.assetId,ownerId:'author',sha256:item.asset.contentHash,mimeType:item.asset.mimeType,sizeBytes:100}
const database=()=>({$queryRaw:vi.fn().mockResolvedValue([{id:asset.id}]),storedAsset:{findUniqueOrThrow:vi.fn().mockResolvedValue(asset)}})
beforeEach(()=>vi.resetAllMocks())
describe('Training material ownership and immutable references',()=>{
  it('requires an exact authorized catalog row even when the asset ID is known',async()=>{
    const db=database();db.$queryRaw.mockResolvedValue([])
    await expect(authorizedTrainingMaterial(db as never,'viewer',asset.id)).rejects.toMatchObject({statusCode:403})
    expect(db.storedAsset.findUniqueOrThrow).not.toHaveBeenCalled()
  })
  it('locks references and rejects mismatches, size violations and unconfirmed rights',async()=>{
    const db=database();await expect(assertTrainingMaterialsUsable(db as never,'author',[[item]])).resolves.toBeUndefined()
    expect(mocks.lock).toHaveBeenCalledWith(db,[asset.id])
    for(const patch of [{sha256:'b'.repeat(64)},{mimeType:'text/html'},{sizeBytes:21*1024*1024}]){
      db.storedAsset.findUniqueOrThrow.mockResolvedValue({...asset,...patch})
      await expect(assertTrainingMaterialsUsable(db as never,'author',[[item]])).rejects.toThrow('身份')
    }
    await expect(assertTrainingMaterialsUsable(db as never,'author',[[{...item,rightsStatus:'unknown'}]])).rejects.toThrow('使用依据')
  })
  it('holds and rechecks the exact independent grant; a vanished grant denies publication',async()=>{
    const db=database();db.storedAsset.findUniqueOrThrow.mockResolvedValue({...asset,ownerId:'other'})
    await expect(assertTrainingMaterialsUsable(db as never,'viewer',[[item]])).resolves.toBeUndefined()
    expect(db.$queryRaw).toHaveBeenCalledTimes(3)
    db.$queryRaw.mockReset().mockResolvedValueOnce([{id:asset.id}]).mockResolvedValueOnce([])
    await expect(assertTrainingMaterialsUsable(db as never,'viewer',[[item]])).rejects.toThrow('授权已失效')
  })
  it('keeps stimulus and report allowlists separate while retaining both',()=>{
    const feedback={schemaVersion:1 as const,rules:[{scoreKey:'total',ranges:[{key:'r',min:0,max:2,includeMax:true,text:'结果',materials:[{...item,asset:{...item.asset,assetId:'298e278f-f993-44fa-9eaa-223693fa4db3'}}]}]}]}
    const d={schemaVersion:2,respondentType:'student_self_report',display:{randomizeItems:false},responseSets:[{key:'r',options:[]}],items:[{itemCode:'q',content:'题目',sortOrder:0,responseSetKey:'r',materials:[item]}],report:{rawScoreFeedback:feedback}} as never
    expect(scaleStimulusMaterialReferences(d)).toEqual([item.asset]);expect(scaleReportMaterialReferences(d)).not.toContainEqual(item.asset)
    expect(scaleAssessmentMediaReferences(d)).toHaveLength(2)
    expect(runnerDefinition(d).items[0].materials).toEqual([{asset:item.asset,name:item.name}])
    expect(JSON.stringify(projectRawScoreFeedback([{...feedback.rules[0].ranges[0],scoreKey:'total',rangeKey:'r'}]))).not.toContain('私有使用依据')
  })
  it('retains typed Form materials in its frozen section without rewriting the original definition',()=>{
    const q={itemKey:'q',materials:[item]},section={items:[{formDefinition:q}]}
    expect(compositeFormSectionMaterialReferences(section)).toEqual([item.asset])
    expect(frozenFormSectionMediaReferences({formSection:{kind:'composite',definition:section}} as never)).toEqual([item.asset])
    expect(publicTrainingFormDefinition(q)).toEqual({itemKey:'q',materials:[{asset:item.asset,name:item.name}]})
    expect(q.materials[0].rightsNote).toBe('私有使用依据')
  })
})

describe('Training material HTTP identity admission',()=>{
  it('rejects malformed content identities before loading any asset',async()=>{
    const router=(await import('../../routes/trainingWorkspace')).default
    const handler=(router as any).stack.find((layer:any)=>layer.route?.path==='/media/:id/content').route.stack[0].handle
    const res:any={statusCode:200,status(code:number){this.statusCode=code;return this},json(body:unknown){this.body=body;return this}}
    const next=vi.fn()
    await handler({user:{userId:'viewer'},params:{id:'not-an-asset-id'}},res,next)
    expect(res.statusCode).toBe(400);expect(next).not.toHaveBeenCalled()
  })
})
