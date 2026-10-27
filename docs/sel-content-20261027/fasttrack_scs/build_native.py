import json
from pathlib import Path
p=Path(__file__).parent
D=json.loads((p/'data.json').read_text())
base='https://fasttrackproject.org/measure/social-competence-'
summaries={
'prosocial':('与他人相处','这些回答记录您在日常相处中看到的分享、帮助、沟通和解决问题的情形。孩子在不同关系和情境中的表现可能不同。','在哪些活动或关系中，孩子更容易与人合作或表达想法？','留意一次具体的合作或善意行为，描述您看到的细节，再给孩子表达自己的机会。'),
'regulation':('面对变化与情绪','这些回答记录您看到孩子应对不如意、分歧和等待等情境的方式；情绪本身并没有对错。','哪些情境更容易让孩子感到紧张？什么支持能帮助孩子恢复平静？','当事情不顺利时，先陪孩子暂停，再一起说出感受并想一个下一步。'),
'academic':('参与学习与活动','这些回答涉及您观察到的注意、主动开始、独立活动和小组合作。环境、任务难度与支持都会影响表现。','孩子在哪类任务或环境里更容易投入？什么情况会增加困难？','尝试把任务分成短步骤，减少干扰，并和孩子一起选择合适的支持。'),
'social_emotional_combined':('相处与调节的合并记录','这个平均值合并了亲社会与情绪调节的题目，适合与两个具体方向一起看；不能代替孩子自己的感受。','合并记录是否掩盖了不同场景中的差异？','与孩子讨论一个具体情境，先听听孩子的说法。'),
 'total':('整份观察记录','这个数字是所有题目的平均值。教师版同时包含学习活动方面，家长版反映家长看到的家庭及社交情境。','有哪些内容是这份记录没有看见、需要向孩子或其他照顾者了解的？','选一件可以调整的小事，并约定之后再看看是否有帮助。')}
for version,d in D.items():
 t=version=='teacher'; who='教师' if t else '家长'; prefix='SCT' if t else 'SCP'; n=len(d['items']); url=base+version+'/'
 def code(i): return f'{prefix}-{i:02}'
 items=[{'itemCode':code(i),'content':x,'type':'single','required':True,'sortOrder':i-1,'responseSetKey':'fasttrack_0_4','randomizeOptions':False} for i,x in enumerate(d['items'],1)]
 rules=[{'itemCode':code(i),'transform':{'type':'identity'}} for i in range(1,n+1)]
 scores=[{'key':x['key'],'type':'total' if x['key']=='total' else 'dimension','label':x['label'],'description':'相关题目的平均值；完整回答才计算。','direction':'higher_is_more','canonical':True,'displayPrecision':2,'missingPolicy':{'type':'complete_required'},'source':{'type':'items','items':[{'itemCode':code(i),'weight':1} for i in x['items']],'aggregation':'mean'}} for x in d['dimensions']]
 interpretations=[]
 for x in d['dimensions']:
  title,summary,question,action=summaries[x['key']]
  if x['key']=='total': summary=('这个数字是全部25题的平均值，包含亲社会、情绪调节及学习活动，不是纯社会情绪总分。' if t else '这个数字是全部12题的平均值，反映家长对家庭及社交情境的观察。')
  interpretations.append({'scoreKey':x['key'],'headline':title,'source':{'type':'score_only'},'summary':summary,'bands':[],'guidance':[{'category':'reflection','text':question},{'category':'strategy','text':action}]})
 fixtures=[]
 for name,v in [('all-zero',0),('all-midpoint',2),('all-maximum',4)]:
  fixtures.append({'name':name,'answers':[{'itemCode':code(i),'responseValue':str(v)} for i in range(1,n+1)],'expected':{'quality':'interpretable','scores':{x['key']:v for x in d['dimensions']},'totalScoreKeys':[x['key'] for x in d['dimensions']]}})
 missing_item=9 if t else 4
 fixtures.append({'name':'missing-prosocial-item','answers':[{'itemCode':code(i),'responseValue':'2'} for i in range(1,n+1) if i != missing_item], 'expected':{'quality':'invalid','scores':{x['key']:(None if missing_item in x['items'] else 2) for x in d['dimensions']},'totalScoreKeys':[x['key'] for x in d['dimensions']]}})
 citation=f'Conduct Problems Prevention Research Group, Fast Track Project. Social Competence Scale — {version.title()} Version. {url}'
 obj={'schemaVersion':1,'identity':{'instrumentKey':f'fasttrack_scs_{version}_zh_cn','instrumentVersion':'1.0.0'},
 'catalog':{'schemaVersion':1,'catalogManifestVersion':1,'catalogStatus':'CANDIDATE','scientificMaturity':'PILOT',
  'identity':{'canonicalName':f'Social Competence Scale — {version.title()} Version','abbreviation':f'SCS-{prefix}','instrumentFamily':'Fast Track Social Competence Scale'},
  'construct':{'primaryDomain':'SOCIAL_EMOTIONAL','secondaryDomains':['ENGAGEMENT'] if t else [],'constructDefinition':f'{who}观察的儿童亲社会沟通和情绪调节'+('，以及学校学习活动表现。' if t else '。'),'constructLevel':'BROAD_DOMAIN','constructOverlapTags':['social_competence','prosocial','emotional_regulation',f'{version}_report']+(['academic_behavior'] if t else [])},
  'population':{'populationNotes':('美国Fast Track项目幼儿园至三年级；中文工作译文未经验证。' if t else '美国Fast Track项目幼儿园至二年级；中文工作译文未经验证。'),'respondentTypes':['TEACHER' if t else 'PARENT'],'developmentalEvidence':'PARTIAL'},
  'administration':{'itemCount':n,'estimatedMinutes':7 if t else 4,'administrationModes':['PAPER'],'timeFrame':'观察者对一般行为的描述；原题未指定回忆期','requiredTraining':False,'itemOrderLocked':True,'responseFormatLocked':True,'layoutConstraints':['原题以0–4评价符合程度；时长为产品估计。','本中文译文是未验证工作稿。']},
  'intendedUse':{'intendedUses':[{'use':'RESEARCH','evidenceStatus':'SUPPORTED','notes':'原项目研究证据不等于中文工作译本验证。'},{'use':'INDIVIDUAL_REFLECTION','evidenceStatus':'EVIDENCE_UNKNOWN','notes':f'反馈属于{who}观察视角，不替代儿童自身看法。'}],'forbiddenUses':['DIAGNOSIS','HIGH_STAKES_SELECTION','SCHOOL_RANKING','TEACHER_ACCOUNTABILITY','UNSUPPORTED_GROUP_COMPARISON']},
  'evidence':[{'evidenceId':f'fasttrack-{version}','evidenceType':'INTERNAL_CONSISTENCY','population':f'US Fast Track {version}-rated early childhood cohort','locale':'en','territory':'US','studyDesign':'Original project technical summary describes subscales and internal consistency.','rating':'UNKNOWN','citation':citation,'url':url,'notes':'美国项目证据不能作为中文译本或目标人群常模。'}],'referenceApplicability':[]},
 'executable':{'releaseStatus':'DRAFT','contentLocale':'zh-CN','references':[],
  'definition':{'schemaVersion':2,'respondentType':f'{version}_report','source':{'title':f'Social Competence Scale — {version.title()} Version','citation':citation,'url':url},'license':{'status':'unknown','redistribution':'unknown','note':'原项目网页标注可供公众使用；中文工作译本与数字分发的许可范围未独立确认。请注明 Conduct Problems Prevention Research Group / Fast Track Project。'},
  'display':{'randomizeItems':False},'responseSets':[{'key':'fasttrack_0_4','options':[{'value':str(i),'label':x,'score':i} for i,x in enumerate(['完全不符合','有一点符合','中等程度符合','比较符合','非常符合'])]}],
  'items':items,'scoring':{'scoringVersion':'1.0.0','itemRules':rules,'defaultMissingPolicy':{'type':'complete_required'},'scores':scores},
  'report':{'reportVersion':'1.0.0','primaryScoreKeys':[x['key'] for x in d['dimensions'] if x['key'] not in ['total','social_emotional_combined']],'scoreOrder':[x['key'] for x in d['dimensions']],'interpretations':interpretations,
   'limitations':[f'这是{who}在特定情境中的观察，不等同于孩子的感受或完整能力。','中文为未经独立验证的工作译稿，原始美国研究不能作为中文人群常模。','完整作答才计算是保守的产品约定，严于原项目对缺答的处理。','不提供常模、百分位或高低等级。'],'disclaimer':'本报告用于交流与反思，不用于诊断、筛查、选拔或排名。'},'referencePolicy':{'type':'none'}},'goldenCases':fixtures}}
 caps={'numericScores':True,'references':False,'individualInterpretations':True,'scoreDerivedLabels':False,'resultQualityDetails':True,'rawAnswers':False,'itemScores':False,'methods':True,'educationalContent':False}
 obj['applicability']={'schemaVersion':1,'policyVersion':f'fasttrack-{version}-v1','respondentTypes':['TEACHER' if t else 'PARENT'],'requiredContextKeys':[]}
 obj['disclosure']={'schemaVersion':1,'policyVersion':f'fasttrack-{version}-v1','audiences':{a:dict(caps) for a in (['respondent','teacher','researcher'] if t else ['respondent','researcher'])},'unknownAudience':'DENY'}
 (p/'native'/version/'instrument.ts').write_text("import type { ScaleInstrumentSourceV1 } from '../../../onboarding/types'\n\n// Unvalidated working translation. The observer and instrument form are explicit.\nexport const SCALE_INSTRUMENT_SOURCE = "+json.dumps(obj,ensure_ascii=False,indent=2)+" satisfies ScaleInstrumentSourceV1\n")
