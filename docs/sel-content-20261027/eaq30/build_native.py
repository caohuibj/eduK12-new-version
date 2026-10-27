import json
from pathlib import Path

p=Path(__file__).parent
data=json.loads((p/'instrument-data.json').read_text())
def q(x): return json.dumps(x,ensure_ascii=False)
def code(i): return f'EAQ-{i:02}'
content=[
 ('分辨情绪','有时一种感觉里会混着好几种情绪，慢一点命名也没关系。','回想最近一次心情复杂的时候，你能找到哪些不同的感受？','选一个时刻，试着用两个情绪词描述自己，不必急着找到唯一答案。'),
 ('用语言分享感受','有时说出感受并不容易；你可以选择合适的人、时间和分享程度。','谁让你感到被认真倾听？你更愿意用说、写还是画的方式表达？','如果愿意，向信任的人说一句“我现在有点……”，也可以先写下来。'),
 ('不隐藏情绪','是否表达情绪会受到场合、关系与安全感影响；保留隐私也是你的选择。','什么时候你觉得表达感受比较自在？什么时候你希望先保留给自己？','想分享时，先选一位信任的人，并说清楚你希望被倾听还是得到建议。'),
 ('身体里的线索','心情有时会伴随身体变化，每个人感受到的方式和强度都不同。这里数字越大，表示回答中较少报告这些身体线索；它不是健康或能力好坏的判断。','紧张、难过或者开心时，你的身体有什么变化？没有明显变化也可以。','找一个舒服的时刻，留意呼吸、肩膀或肚子，感到不舒服时可以停下。'),
 ('关注别人的感受','别人的表情或话语可能提供线索，但猜测不一定准确。','当朋友心情不好时，你通常怎样发现？你希望怎样确认自己的理解？','如果对方愿意，可以问“你现在感觉怎么样？需要我陪你吗？”'),
 ('想一想自己的情绪','回头看看情绪与发生的事之间有什么联系，可以帮助你理解自己。','最近一次情绪变化前发生了什么？当时你有什么需要？','试着记下“发生了……我感觉……我需要……”，不知道的部分可以留空。'),
]
items=[dict(itemCode=code(i), content=t, type='single', required=True, sortOrder=i-1, responseSetKey='eaq_truth_1_3', randomizeOptions=False) for i,t in enumerate(data['items'],1)]
rules=[dict(itemCode=code(i), transform={'type':'reverse' if i in data['reverse'] else 'identity'}) for i in range(1,31)]
scores=[dict(key=d['key'],type='dimension',label=d['label'],description=('分数越大表示较少报告身体线索。' if d['key']=='bodily_unawareness' else '反向计分后的题目均值，反映这一方面的回答。'),direction='higher_is_more',canonical=True,displayPrecision=2,missingPolicy={'type':'complete_required'},source={'type':'items','items':[{'itemCode':code(i),'weight':1} for i in d['items']],'aggregation':'mean'}) for d in data['dimensions']]
interpretations=[dict(scoreKey=d['key'],headline=c[0],source={'type':'score_only'},summary=c[1],bands=[],guidance=[{'category':'reflection','text':c[2]},{'category':'strategy','text':c[3]}]) for d,c in zip(data['dimensions'],content)]
def fixture(name, formula, expected):
 return {'name':name,'answers':[{'itemCode':code(i),'responseValue':str(formula(i))} for i in range(1,31)],'expected':{'quality':'interpretable','scores':{d['key']:expected for d in data['dimensions']},'totalScoreKeys':[d['key'] for d in data['dimensions']]}}
fixtures=[fixture('all-midpoint',lambda i:2,2),fixture('all-keyed-maximum',lambda i:1 if i in data['reverse'] else 3,3),fixture('all-keyed-minimum',lambda i:3 if i in data['reverse'] else 1,1)]
fixtures.append({'name':'missing-differentiation-item','answers':[{'itemCode':code(i),'responseValue':'2'} for i in range(2,31)],'expected':{'quality':'invalid','scores':{d['key']:(None if d['key']=='differentiating' else 2) for d in data['dimensions']},'totalScoreKeys':[d['key'] for d in data['dimensions']]}})
citation='Rieffe C, Oosterveld P, Miers AC, Meerum Terwogt M, Ly V. (2008). Emotion awareness and internalising symptoms in children and adolescents: The Emotion Awareness Questionnaire revised. Personality and Individual Differences, 45, 756–761.'
obj={
 'schemaVersion':1,'identity':{'instrumentKey':'eaq30_rieffe_zh_cn','instrumentVersion':'1.0.0'},
 'catalog':{'schemaVersion':1,'catalogManifestVersion':1,'catalogStatus':'CANDIDATE','scientificMaturity':'PILOT',
   'identity':{'canonicalName':'Emotion Awareness Questionnaire Revised, 30-item','abbreviation':'EAQ30','instrumentFamily':'Emotion Awareness Questionnaire'},
   'construct':{'primaryDomain':'SOCIAL_EMOTIONAL','secondaryDomains':[],'constructDefinition':'儿童青少年如何辨认、分享、隐藏和思考自己及他人的情绪，以及是否报告情绪相关的身体线索。','constructLevel':'BROAD_DOMAIN','constructOverlapTags':['emotion_awareness','emotion_differentiation','emotion_expression','bodily_signals','self_report']},
   'population':{'populationNotes':'2008年荷兰儿童和青少年样本；此中文工作译稿未经独立回译或本地验证。','respondentTypes':['SELF'],'developmentalEvidence':'PARTIAL'},
   'administration':{'itemCount':30,'estimatedMinutes':8,'administrationModes':['PAPER'],'timeFrame':'通常情形，无指定回忆期','requiredTraining':False,'itemOrderLocked':True,'responseFormatLocked':True,'layoutConstraints':['预计时长是产品估计；顺序与英国版题本一致。','保持三档与六维原计分；身体维度方向不同。']},
   'intendedUse':{'intendedUses':[{'use':'RESEARCH','evidenceStatus':'SUPPORTED','notes':'原文研究支持；中文工作译文尚未验证。'},{'use':'INDIVIDUAL_REFLECTION','evidenceStatus':'EVIDENCE_UNKNOWN','notes':'作者明确没有个体分数解释的信息；反馈仅作普遍反思。'}], 'forbiddenUses':['DIAGNOSIS','HIGH_STAKES_SELECTION','SCHOOL_RANKING','TEACHER_ACCOUNTABILITY','UNSUPPORTED_GROUP_COMPARISON']},
   'evidence':[{'evidenceId':'rieffe-2008','evidenceType':'STRUCTURAL_VALIDITY','population':'Dutch primary and secondary school children and young adolescents','locale':'nl','territory':'NL','sampleSize':665,'studyDesign':'Revision and six-factor analysis of 30 items; 41 of 706 excluded for more than six missing values.','rating':'MIXED','citation':citation,'doi':'10.1016/j.paid.2008.08.001','url':'https://doi.org/10.1016/j.paid.2008.08.001','notes':'Original paper reports most items loaded on their keyed factors, with one exception. This is not evidence for this Chinese working translation.'}], 'referenceApplicability':[]},
 'executable':{'releaseStatus':'DRAFT','contentLocale':'zh-CN','references':[],
  'definition':{'schemaVersion':2,'respondentType':'participant_self_report','source':{'title':'Emotion Awareness Questionnaire Revised (EAQ30)','citation':citation,'url':'https://www.focusonemotions.nl/instruments/emotion-awareness-questionnaire-eaq','publicationYear':2008},
   'license':{'status':'unknown','redistribution':'unknown','note':'作者站欢迎使用并允许翻译，列出回译和审阅步骤；本译稿尚未完成这些步骤。数字化及分发范围未明。'},
   'display':{'randomizeItems':False},'responseSets':[{'key':'eaq_truth_1_3','options':[{'value':'1','label':'不符合','score':1},{'value':'2','label':'有时符合','score':2},{'value':'3','label':'符合','score':3}]}],
   'items':items,'scoring':{'scoringVersion':'1.0.0','itemRules':rules,'defaultMissingPolicy':{'type':'complete_required'},'scores':scores},
   'report':{'reportVersion':'1.0.0','primaryScoreKeys':[d['key'] for d in data['dimensions']],'scoreOrder':[d['key'] for d in data['dimensions']],'interpretations':interpretations,
    'limitations':['这是未经回译及本地验证的中文工作译稿，结果不可视作已验证中文测量结果。','作者表示没有常模、界值或个体分数解释信息；数字不是等级，不能用作筛查。','身体维度按作者计分语法方向为较少报告身体线索，其余维度应各自理解。','该报告是单次自述，缺失维度不计分。'],'disclaimer':'这些内容仅供一般自我反思，不用于诊断、筛查、选拔或排名。'},
   'referencePolicy':{'type':'none'}},'goldenCases':fixtures}}
caps={'numericScores':True,'references':False,'individualInterpretations':True,'scoreDerivedLabels':False,'resultQualityDetails':True,'rawAnswers':False,'itemScores':False,'methods':True,'educationalContent':False}
obj['applicability']={'schemaVersion':1,'policyVersion':'eaq30-v1','respondentTypes':['SELF'],'requiredContextKeys':[]}
obj['disclosure']={'schemaVersion':1,'policyVersion':'eaq30-v1','audiences':{a:dict(caps) for a in ['respondent','subject','teacher','researcher']},'unknownAudience':'DENY'}
out="import type { ScaleInstrumentSourceV1 } from '../../../onboarding/types'\n\n// Working translation, not independently back-translated or validated.\nexport const SCALE_INSTRUMENT_SOURCE = "+json.dumps(obj,ensure_ascii=False,indent=2)+" satisfies ScaleInstrumentSourceV1\n"
(p/'native/instrument.ts').write_text(out)
