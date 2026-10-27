import json
from pathlib import Path
p=Path(__file__).parent; D=json.loads((p/'data.json').read_text())
url='https://doi.org/10.1037/0012-1649.33.6.906'
citation='Shields A, Cicchetti D. (1997). Emotion regulation among school-age children: The development and validation of a new criterion Q-sort scale. Developmental Psychology, 33(6), 906–916.'
messages={
'emotion_regulation':('情绪表达与调节','这部分记录您看到孩子表达感受、回应他人以及关心他人的一些方式。数字只来自您的观察，还要结合孩子的处境和自己的表达来理解。','孩子在什么人或情境中比较容易说出感受？您是否注意到不一样的表达方式？','在平静的时候邀请孩子说说感受，也可以让孩子选择用画画、写字或其他方式表达。'),
'lability_negativity':('情绪变化与负面反应','这部分记录您看到的情绪变化、受挫反应和行为。数字越大表示此类描述在回答中越常出现，不代表孩子的性格或诊断。','哪些情境下孩子更容易感到困难？当时任务、环境和支持有什么不同？','先观察触发情境，帮孩子暂停并给予陪伴；等平静后再一起想下一步。')}
for ver in ['parent','teacher']:
 who='家长' if ver=='parent' else '教师'; typ='PARENT' if ver=='parent' else 'TEACHER'; code=lambda i:f'ERC-{i:02}'
 items=[{'itemCode':code(i),'content':x,'type':'single','required':True,'sortOrder':i-1,'responseSetKey':'erc_frequency_1_4','randomizeOptions':False} for i,x in enumerate(D['items'],1)]
 rules=[{'itemCode':code(i),'transform':{'type':'reverse' if i in D['reverse'] else 'identity'}} for i in range(1,25)]
 scores=[{'key':d['key'],'type':'dimension','label':d['label'],'description':('8题总和，较高分表示观察到更多该维度所列的表达与调节行为。' if d['key']=='emotion_regulation' else '15题总和，较高分表示观察到更多该维度所列的情绪变化与负面反应。'),'direction':'higher_is_more','canonical':True,'displayPrecision':0,'missingPolicy':{'type':'complete_required'},'source':{'type':'items','items':[{'itemCode':code(i),'weight':1} for i in d['items']],'aggregation':'sum'}} for d in D['dimensions']]
 interpretations=[]
 for d in D['dimensions']:
  title,summary,reflection,action=messages[d['key']];interpretations.append({'scoreKey':d['key'],'headline':title,'source':{'type':'score_only'},'summary':summary,'bands':[],'guidance':[{'category':'reflection','text':reflection},{'category':'strategy','text':action}]})
 def fixture(name,form,expected,omit=[]):
  return {'name':name,'answers':[{'itemCode':code(i),'responseValue':str(form(i))} for i in range(1,25) if i not in omit],'expected':{'quality':'invalid' if any(expected[k] is None for k in expected) else 'interpretable','scores':expected,'totalScoreKeys':[d['key'] for d in D['dimensions']]}}
 cases=[fixture('minimum-keyed',lambda i:4 if i in D['reverse'] else 1,{'emotion_regulation':8,'lability_negativity':15}),fixture('maximum-keyed',lambda i:1 if i in D['reverse'] else 4,{'emotion_regulation':32,'lability_negativity':60}),fixture('missing-unscored-item',lambda i:2,{'emotion_regulation':18,'lability_negativity':34},[12]),fixture('missing-regulation-item',lambda i:2,{'emotion_regulation':None,'lability_negativity':34},[1])]
 caps={'numericScores':True,'references':False,'individualInterpretations':True,'scoreDerivedLabels':False,'resultQualityDetails':True,'rawAnswers':False,'itemScores':False,'methods':True,'educationalContent':False}
 obj={'schemaVersion':1,'identity':{'instrumentKey':f'erc24_{ver}_zh_cn','instrumentVersion':'1.0.0'},
 'catalog':{'schemaVersion':1,'catalogManifestVersion':1,'catalogStatus':'CANDIDATE','scientificMaturity':'PILOT',
  'identity':{'canonicalName':f'Emotion Regulation Checklist — {ver.title()} Report','abbreviation':'ERC-24','instrumentFamily':'Emotion Regulation Checklist'},
  'construct':{'primaryDomain':'SOCIAL_EMOTIONAL','secondaryDomains':['SELF_REGULATION'],'constructDefinition':f'{who}所观察的儿童情绪表达、调节以及情绪变化和负面反应。','constructLevel':'SPECIFIC_CONSTRUCT','constructOverlapTags':['emotion_regulation','lability_negativity',f'{ver}_report']},
  'population':{'minAge':6,'maxAge':12,'respondentTypes':[typ],'developmentalEvidence':'PARTIAL','populationNotes':'原始研究为美国6–12岁儿童的辅导员报告；本版本为'+who+'他评工作译稿，中文尚未验证。'},
  'administration':{'itemCount':24,'estimatedMinutes':7,'administrationModes':['PAPER'],'timeFrame':'通常观察到的频率；原材料存在不同施测说明版本','requiredTraining':False,'itemOrderLocked':True,'responseFormatLocked':True,'layoutConstraints':['1–4频率选项；分量表方向不同。','第12题保留但不计入原始两个分量表；预计时间为产品估计。']},
  'intendedUse':{'intendedUses':[{'use':'RESEARCH','evidenceStatus':'SUPPORTED','notes':'原研究及跨文化研究不等同于本中文工作译稿验证。'},{'use':'INDIVIDUAL_REFLECTION','evidenceStatus':'EVIDENCE_UNKNOWN','notes':'只反映观察者视角，不能代替孩子自述。'}],'forbiddenUses':['DIAGNOSIS','HIGH_STAKES_SELECTION','SCHOOL_RANKING','TEACHER_ACCOUNTABILITY','UNSUPPORTED_GROUP_COMPARISON']},
  'evidence':[{'evidenceId':'shields-cicchetti-1997','evidenceType':'STRUCTURAL_VALIDITY','population':'US school-age children, counselor reports','locale':'en','territory':'US','sampleSize':143,'studyDesign':'Original study derived two factors; item 12 was excluded from both factors.','rating':'MIXED','citation':citation,'doi':'10.1037/0012-1649.33.6.906','url':url,'notes':'Later studies report factor-structure variation across contexts, ages and informants; not local Chinese validation.'}], 'referenceApplicability':[]},
 'applicability':{'schemaVersion':1,'policyVersion':f'erc24-{ver}-v1','respondentTypes':[typ],'requiredContextKeys':[]},
 'disclosure':{'schemaVersion':1,'policyVersion':f'erc24-{ver}-v1','audiences':{a:dict(caps) for a in (['respondent','teacher','researcher'] if ver=='teacher' else ['respondent','researcher'])},'unknownAudience':'DENY'},
 'executable':{'releaseStatus':'DRAFT','contentLocale':'zh-CN','references':[],
  'definition':{'schemaVersion':2,'respondentType':f'{ver}_report','source':{'title':'Emotion Regulation Checklist','citation':citation,'url':url,'publicationYear':1997},'license':{'status':'unknown','redistribution':'unknown','note':'未确认本工具在项目中的翻译和数字分发许可；本中文内容为未验证工作译稿。'},'display':{'randomizeItems':False},
   'responseSets':[{'key':'erc_frequency_1_4','options':[{'value':str(i),'label':x,'score':i} for i,x in enumerate(['很少或从不','有时','经常','几乎总是'],1)]}],
   'items':items,'scoring':{'scoringVersion':'1.0.0','itemRules':rules,'defaultMissingPolicy':{'type':'complete_required'},'scores':scores},
   'report':{'reportVersion':'1.0.0','primaryScoreKeys':[d['key'] for d in D['dimensions']],'scoreOrder':[d['key'] for d in D['dimensions']],'interpretations':interpretations,
    'limitations':[f'这是{who}在特定情境下的观察，不等于孩子自己的感受或完整能力。','情绪表达与调节及情绪变化与负面反应的方向不同，不能混成一个总分。','中文工作译稿尚未回译或本地验证；原研究不构成中文人群常模。','每维完整才计算是产品约定，题12不进入两个分量表。'],'disclaimer':'用于交流和反思，不用于诊断、筛查、选拔或排名。'},'referencePolicy':{'type':'none'}},'goldenCases':cases}}
 (p/'native'/ver/'instrument.ts').write_text("import type { ScaleInstrumentSourceV1 } from '../../../onboarding/types'\n\n// Unvalidated working translation; item 12 is administered but not scored.\nexport const SCALE_INSTRUMENT_SOURCE = "+json.dumps(obj,ensure_ascii=False,indent=2)+" satisfies ScaleInstrumentSourceV1\n")
