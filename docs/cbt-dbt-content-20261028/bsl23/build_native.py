import json
from pathlib import Path
p=Path(__file__).parent
mapping=json.loads((p/'scoring.json').read_text())
items=[
"It was hard for me to concentrate",
"I felt helpless",
"I was absent-minded and unable to remember what I was actually doing",
"I felt disgust",
"I thought of hurting myself",
"I didn’t trust other people",
"I didn’t believe in my right to live",
"I was lonely",
"I experienced stressful inner tension",
"I had images that I was very much afraid of",
"I hated myself",
"I wanted to punish myself",
"I suffered from shame",
"My mood rapidly cycled in terms of anxiety, anger, and depression",
"I suffered from voices and noises from inside or outside my head",
"Criticism had a devastating effect on me",
"I felt vulnerable",
"The idea of death had a certain fascination for me",
"Everything seemed senseless to me",
"I was afraid of losing control",
"I felt disgusted by myself",
"I felt as if I was far away from myself",
"I felt worthless" ]
reverse=mapping['reverse_items']; code=lambda i:f'BSL-{i:02}'
citation='Bohus M, Limberger MF, Frank U, Chapman AL, Kühler T, Stieglitz R-D. (2007). Psychometric properties of the Borderline Symptom List (BSL). BMC Psychiatry, 7, 70.'
src='https://depts.washington.edu/uwbrtc/wp-content/uploads/Borderline-Symptom-List-BLS-23.pdf'
scoringsrc='https://depts.washington.edu/uwbrtc/wp-content/uploads/BSL23-scoring-1.pdf'
refs={'total':list(range(1,24)),'mean':list(range(1,24))}
labels={'total':'全部23题总和','mean':'全部23题均值'}
scores=[{'key':'total','type':'total','label':labels['total'],'description':'23题作答直接求和（无反向题）；必须完整作答。范围0–92，分数越高代表上一周这类困扰平均越重。','direction':'higher_is_more','canonical':True,'displayPrecision':0,'missingPolicy':{'type':'complete_required'},'source':{'type':'items','items':[{'itemCode':code(i),'weight':1} for i in refs['total']],'aggregation':'sum'}},
{'key':'mean','type':'total','label':labels['mean'],'description':'23题作答求均值（无反向题）；必须完整作答。范围0–4，便于不同时点比较。','direction':'higher_is_more','canonical':False,'displayPrecision':2,'missingPolicy':{'type':'complete_required'},'source':{'type':'items','items':[{'itemCode':code(i),'weight':1} for i in refs['mean']],'aggregation':'mean'}}]
interpretations=[
{'scoreKey':'total','headline':'这一周的困扰记录','source':{'type':'score_only'},'summary':'这份记录汇总了上一周23类困扰出现的强度，是研究情境下的症状变化指标，不是诊断，也不定义你这个人。数字高只说明这一周更难熬，不代表以后一直如此。','bands':[],'guidance':[{'category':'reflection','text':'这一周里，哪一天感觉最不一样？当时发生了什么或谁在场？'},{'category':'strategy','text':'把这份记录带给你的医生或心理专业人员，一起看趋势比单次数字更有用。'}]},
{'scoreKey':'mean','headline':'平均强度','source':{'type':'score_only'},'summary':'均值把总和换算回0–4的范围，方便与之前或之后的记录比较。它不能与他人直接比较，也不用于划定“严重程度等级”。','bands':[],'guidance':[{'category':'reflection','text':'与上次记录相比，哪些方面变化最大？'},{'category':'strategy','text':'如果出现伤害自己的念头，请立即联系你的治疗团队或当地危机干预/心理援助热线；等待时先让自己待在安全的环境。'}]}]
def fixture(name,answer,miss=[]):
 values={i:answer[i] for i in range(1,24) if i not in miss}
 return {'name':name,'answers':[{'itemCode':code(i),'responseValue':str(answer[i])} for i in range(1,24) if i not in miss],'expected':{'quality':'invalid' if miss else 'interpretable','scores':{'total':(None if miss else sum(values.values())),'mean':(None if miss else round(sum(values.values())/len(values),2))},'totalScoreKeys':list(refs)}}
low={i:0 for i in range(1,24)};high={i:4 for i in range(1,24)}
sample={i:(1 if i%2 else 2) for i in range(1,24)}
fixtures=[fixture('all-keyed-min',low),fixture('all-keyed-max',high),fixture('sample-odd1-even2',sample),fixture('missing-total',sample,[5])]
(p/'sample-responses.json').write_text(json.dumps(sample,indent=2))
caps={'numericScores':True,'references':False,'individualInterpretations':True,'scoreDerivedLabels':False,'resultQualityDetails':True,'rawAnswers':False,'itemScores':False,'methods':True,'educationalContent':False}
obj={'schemaVersion':1,'identity':{'instrumentKey':'bsl23','instrumentVersion':'1.0.0'},
'catalog':{'schemaVersion':1,'catalogManifestVersion':1,'catalogStatus':'CANDIDATE','scientificMaturity':'PILOT','identity':{'canonicalName':'Borderline Symptom List-23','abbreviation':'BSL-23','instrumentFamily':'Borderline Symptom List'},
'construct':{'primaryDomain':'BEHAVIORAL_DIFFICULTIES','secondaryDomains':[],'constructDefinition':'自评上一周边缘型人格相关困扰的强度，用作临床症状变化的结局指标。','constructLevel':'SPECIFIC_CONSTRUCT','constructOverlapTags':['domain:dbt','construct:dbt_bsl23_borderline_symptoms','clinical_symptom_outcome','adult_clinical_population','self_report','use:research','language_validation:english_original','license:rights_restricted_noncommercial']},
'population':{'populationNotes':'原版为德国成人临床样本（边缘型人格障碍及对照），英语版经 UW BRTC 分发；未建立儿童青少年常模。本工具面向临床研究情境，不得用于普通学生筛查或个体分级；含自伤相关条目，施测须配套专业支持流程。','respondentTypes':['SELF'],'developmentalEvidence':'ESTABLISHED'},
'administration':{'itemCount':23,'estimatedMinutes':8,'administrationModes':['DIGITAL_SUPERVISED','PAPER'],'timeFrame':'过去一周','requiredTraining':True,'itemOrderLocked':True,'responseFormatLocked':True,'layoutConstraints':['保留原23题顺序与0–4五档强度选项。','表内附带的0–100%总体状态自评与BSL补充行为条目不属于BSL-23计分，未实现。','建议在专业指导下施测；数字模式不含独立施测入口。']},
'intendedUse':{'intendedUses':[{'use':'RESEARCH','evidenceStatus':'SUPPORTED','notes':'原版用于边缘型人格症状变化的量化追踪。'}],'forbiddenUses':['DIAGNOSIS','HIGH_STAKES_SELECTION','SCHOOL_RANKING','TEACHER_ACCOUNTABILITY','UNSUPPORTED_GROUP_COMPARISON','INDIVIDUAL_REFLECTION']},
'evidence':[{'evidenceId':'bohus-bsl-2007','evidenceType':'STRUCTURAL_VALIDITY','population':'German adult clinical samples (BPD and comparisons)','locale':'de','territory':'DE','studyDesign':'Scale development and psychometric evaluation of the BSL and brief 23-item form.','rating':'SUFFICIENT','citation':citation,'doi':'10.1186/1471-244X-7-70','url':'https://doi.org/10.1186/1471-244X-7-70','notes':'英语题本与官方计分说明经 UW BRTC 分发；计分信为23题求和（0–92）与均值（官方允许缺2题，产品未采用该宽限）。无临床界值；不用于诊断。'}],'referenceApplicability':[]},
'applicability':{'schemaVersion':1,'policyVersion':'bsl23-en-v1','respondentTypes':['SELF'],'requiredContextKeys':[]},
'disclosure':{'schemaVersion':1,'policyVersion':'bsl23-en-v1','audiences':{a:dict(caps) for a in ['respondent','subject','teacher','researcher']},'unknownAudience':'DENY'},
'instruction':{'schemaVersion':1,'text':'In the following table you will find a set of difficulties and problems which possibly describe you. Please work through the questionnaire and decide how much you suffered from each problem in the course of the last week. In case you have no feelings at all at the present moment, please answer according to how you think you might have felt. Please answer honestly. All questions refer to the last week. If you felt different ways at different times in the week, give a rating for how things were for you on average. Please be sure to answer each question.','language':'en','version':'1.0.0','source':'UW BRTC 分发英语题本第1页前导语（©PSM ZI Mannheim 06/2007），逐字转录。'},
'executable':{'releaseStatus':'DRAFT','contentLocale':'en','references':[],
'definition':{'schemaVersion':2,'respondentType':'participant_self_report','source':{'title':'Borderline Symptom List 23 (BSL-23)','citation':citation,'url':src,'publicationYear':2007},
'license':{'status':'restricted','redistribution':'restricted','note':'英语题本 ©PSM ZI Mannheim 06/2007，经华盛顿大学 BRTC 评估工具页公开分发；BRTC 声明其工具仅限研究、临床及教育用途，不得商业使用。本登记仅用于非商业研究草稿；正式发布、翻译或商业部署前须联系权利方（计分说明页留有作者联系方式 Martin.Bohus@zi-mannheim.de）。'},
'display':{'randomizeItems':False},'responseSets':[{'key':'bsl_intensity_0_4','options':[{'value':'0','label':'not at all','score':0},{'value':'1','label':'a little','score':1},{'value':'2','label':'rather','score':2},{'value':'3','label':'much','score':3},{'value':'4','label':'very strong','score':4}]}],
'items':[{'itemCode':code(i),'content':x,'type':'single','required':True,'sortOrder':i-1,'responseSetKey':'bsl_intensity_0_4','randomizeOptions':False} for i,x in enumerate(items,1)],
'scoring':{'scoringVersion':'1.0.0','itemRules':[{'itemCode':code(i),'transform':{'type':'identity'}} for i in range(1,24)],'defaultMissingPolicy':{'type':'complete_required'},'scores':scores},
'report':{'reportVersion':'1.0.0','primaryScoreKeys':['total','mean'],'scoreOrder':list(refs),'interpretations':interpretations,'limitations':['本工具是临床研究情境下的症状变化指标，不是诊断，也不能用于普通学生筛查或个体分级。','原版样本为德国成人临床人群；不构成儿童青少年常模。','没有常模、百分位或临床界值；单次分数不构成严重程度判定。','官方计分允许缺2题计算均值；产品采用更严格的完整作答约定，缺答不补零。','含自伤相关条目；施测与结果反馈须配套专业支持流程。'],'disclaimer':'仅供研究情境使用；若出现伤害自己的念头，请立即联系治疗团队或当地危机干预/心理援助热线。'},'referencePolicy':{'type':'none'}},'goldenCases':fixtures}}
(p/'native/instrument.ts').write_text("import type { ScaleInstrumentSourceV1 } from '../../../onboarding/types'\n\n// English item text © PSM ZI Mannheim 06/2007, distributed via UW BRTC for noncommercial research/clinical/educational use.\nexport const SCALE_INSTRUMENT_SOURCE = "+json.dumps(obj,ensure_ascii=False,indent=2)+" satisfies ScaleInstrumentSourceV1\n")
print('bsl23 native written')
