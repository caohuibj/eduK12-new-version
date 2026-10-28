import json
from pathlib import Path
p=Path(__file__).parent
mapping=json.loads((p/'scoring.json').read_text())
items=[
"I feel like I'm up against the world",
"I'm no good.",
"Why can't I ever succeed?",
"No one understands me.",
"I've let people down.",
"I don't think I can go on.",
"I wish I were a better person",
"I'm so weak.",
"My life's not going the way I want it to.",
"I'm so disappointed in myself.",
"Nothing feels good anymore.",
"I can't stand this anymore.",
"I can't get started.",
"What's wrong with me?",
"I wish I were somewhere else",
"I can't get things together.",
"I hate myself.",
"I'm worthless.",
"Wish I could just disappear.",
"What's the matter with me?",
"I'm a loser.",
"My life is a mess.",
"I'm a failure.",
"I'll never make it.",
"I feel so helpless.",
"Something has to change",
"There must be something wrong with me.",
"My future is bleak.",
"It's just not worth it.",
"I can't finish anything." ]
reverse=mapping['reverse_items'];dimensions=mapping['dimensions']; code=lambda i:f'ATQ-{i:02}'
citation='Hollon SD, Kendall PC. (1980). Cognitive self-statements in depression: Development of an Automatic Thoughts Questionnaire. Cognitive Therapy and Research, 4(4), 383–395.'
src='https://dradamvolungis.com/wp-content/uploads/2020/06/automatic-thoughts-questionnaire.pdf'
refs={**dimensions,'total':list(range(1,31))}; labels={'pmdc':'个人调适不良与改变愿望','nsne':'消极自我概念与消极期待','lse':'低自尊','helplessness':'无助感','total':'全部30题总和'}
scores=[{'key':k,'type':'total' if k=='total' else 'dimension','label':labels[k],'description':'相关题作答直接求和（无反向题）；必须完整作答。','direction':'higher_is_more','canonical':k=='total','displayPrecision':0,'missingPolicy':{'type':'complete_required'},'source':{'type':'items','items':[{'itemCode':code(i),'weight':1} for i in ids],'aggregation':'sum'}} for k,ids in refs.items()]
interpretations=[
{'scoreKey':'total','headline':'这周脑中闪过的念头','source':{'type':'score_only'},'summary':'这份记录统计的是近一周30句消极自动思维出现的频率。念头出现得多，不等于它们是真的，也不等于你出了问题；频率本身会随压力和睡眠波动。','bands':[],'guidance':[{'category':'reflection','text':'回看这一周，哪类情境最容易触发这类念头（比如被批评、考试、独处）？'},{'category':'strategy','text':'把其中一句念头写下来，试着在旁边写下“如果朋友这样想，我会对他说什么”。'}]},
{'scoreKey':'pmdc','headline':'想改变的急迫','source':{'type':'score_only'},'summary':'这组题反映“想摆脱现状、希望一切不同”的念头频率。想改变是行动的起点；但“必须马上全部改变”的紧迫感本身会加重疲惫。','bands':[],'guidance':[{'category':'reflection','text':'如果改变只能从一件小事开始，你会选哪一件？'},{'category':'strategy','text':'把“我必须……”改写成“我可以先……”，选一个本周能做到的最小步骤。'}]},
{'scoreKey':'nsne','headline':'对自己的负面预期','source':{'type':'score_only'},'summary':'这组题统计“我不行、不会成功”一类对自我的消极判断出现的频率。预期不等于事实；它们更像过去经历的回声，而非对未来的准确预测。','bands':[],'guidance':[{'category':'reflection','text':'这些预期里，有没有一条与最近发生的具体事实不符？'},{'category':'strategy','text':'为一条消极预期找一个“反例记录”：过去一次与它相反的真实经历，写在手机备忘里。'}]},
{'scoreKey':'lse','headline':'对自己的评价','source':{'type':'score_only'},'summary':'这组题关注自我批评、自我贬低的念头。评价性的话听起来像事实，其实是一种视角；它可以在被注意到之后松动。','bands':[],'guidance':[{'category':'reflection','text':'你对自己说这些话时，用的语气和对朋友的一样吗？'},{'category':'strategy','text':'下次自我批评的念头出现时，试着把它换成你会对好朋友使用的同一句话。'}]},
{'scoreKey':'helplessness','headline':'无力感','source':{'type':'score_only'},'summary':'这两题统计“做什么都没用、坚持不下去”一类念头。无力感是一种可以被理解的状态，不是性格缺陷；它通常在支持和支持性行动之后减轻。','bands':[],'guidance':[{'category':'reflection','text':'过去一个月里，有没有一件“很小的事”其实完成了？'},{'category':'strategy','text':'告诉一位信任的人你最近的感受；如果这些念头持续加重，请考虑联系专业心理支持。'}]}]
def fixture(name,answer,miss=[]):
 values={i:answer[i] for i in range(1,31) if i not in miss}
 return {'name':name,'answers':[{'itemCode':code(i),'responseValue':str(answer[i])} for i in range(1,31) if i not in miss],'expected':{'quality':'invalid' if miss else 'interpretable','scores':{k:(None if any(i in miss for i in ids) else sum(values[i] for i in ids)) for k,ids in refs.items()},'totalScoreKeys':list(refs)}}
low={i:1 for i in range(1,31)};high={i:5 for i in range(1,31)}
sample={i:(4 if i in dimensions['nsne'] else 2) for i in range(1,31)}
fixtures=[fixture('all-keyed-min',low),fixture('all-keyed-max',high),fixture('sample-nsne4-rest2',sample),fixture('missing-total',sample,[7])]
(p/'sample-responses.json').write_text(json.dumps(sample,indent=2))
caps={'numericScores':True,'references':False,'individualInterpretations':True,'scoreDerivedLabels':False,'resultQualityDetails':True,'rawAnswers':False,'itemScores':False,'methods':True,'educationalContent':False}
obj={'schemaVersion':1,'identity':{'instrumentKey':'atq30','instrumentVersion':'1.0.0'},
'catalog':{'schemaVersion':1,'catalogManifestVersion':1,'catalogStatus':'CANDIDATE','scientificMaturity':'PILOT','identity':{'canonicalName':'Automatic Thoughts Questionnaire, 30-item frequency version','abbreviation':'ATQ','instrumentFamily':'Automatic Thoughts Questionnaire'},
'construct':{'primaryDomain':'SELF_REGULATION','secondaryDomains':[],'constructDefinition':'自评近一周消极自动思维（针对自我的负面念头）出现的频率。','constructLevel':'SPECIFIC_CONSTRUCT','constructOverlapTags':['domain:cbt','construct:cbt_atq_negative_automatic_thoughts','automatic_thoughts','cognitive_behavioral_mechanism','adult_self_report','self_report','use:reflection','use:research','language_validation:english_original','license:license_unverified']},
'population':{'populationNotes':'原版开发与验证样本为美国大学生及成人临床对照样本；未建立儿童青少年常模。K12学生施测前须评估年龄适配性（儿童青少年版 CATS 尚未入库）。','respondentTypes':['SELF'],'developmentalEvidence':'ESTABLISHED'},
'administration':{'itemCount':30,'estimatedMinutes':10,'administrationModes':['DIGITAL_SELF_ADMINISTERED','DIGITAL_SUPERVISED','PAPER'],'timeFrame':'过去一周','requiredTraining':False,'itemOrderLocked':True,'responseFormatLocked':True,'layoutConstraints':['保留原30题顺序与五点频率选项。','本实现仅计频率列；第三方资料的ATQ-B版本另有“想法可信度”列，未实现。']},
'intendedUse':{'intendedUses':[{'use':'RESEARCH','evidenceStatus':'SUPPORTED','notes':'原版在大学生与抑郁-非抑郁对照样本中区分良好。'},{'use':'INDIVIDUAL_REFLECTION','evidenceStatus':'EVIDENCE_UNKNOWN','notes':'频率反馈不构成抑郁诊断或治疗建议。'}],'forbiddenUses':['DIAGNOSIS','HIGH_STAKES_SELECTION','SCHOOL_RANKING','TEACHER_ACCOUNTABILITY','UNSUPPORTED_GROUP_COMPARISON']},
'evidence':[{'evidenceId':'hollon-kendall-atq-1980','evidenceType':'STRUCTURAL_VALIDITY','population':'US college students; depressed vs nondepressed adult comparisons','locale':'en','territory':'US','studyDesign':'Scale development with internal consistency and discrimination between depressed and nondepressed groups.','rating':'SUFFICIENT','citation':citation,'url':src,'notes':'来源文档报告α=.97；无本地常模，无临床界值。题文转录自第三方公开教学资料，正式采用前须与原版核对。'}],'referenceApplicability':[]},
'applicability':{'schemaVersion':1,'policyVersion':'atq30-en-v1','respondentTypes':['SELF'],'requiredContextKeys':[]},
'disclosure':{'schemaVersion':1,'policyVersion':'atq30-en-v1','audiences':{a:dict(caps) for a in ['respondent','subject','teacher','researcher']},'unknownAudience':'DENY'},
'instruction':{'schemaVersion':1,'text':'Listed below are a variety of thoughts that pop into people\'s heads. Please read each thought and indicate how frequently, if at all, the thought occurred to you over the last week. Please read each item carefully and circle the appropriate answers on the answer sheet in the following fashion (1 = "not at all", 2 = "sometimes", 3 = "moderately often", 4 = "often", and 5 = "all the time").','language':'en','version':'1.0.0','source':'第三方转录题本ATQ-B频率列前导语；信念度列未实现。'},
'executable':{'releaseStatus':'DRAFT','contentLocale':'en','references':[],
'definition':{'schemaVersion':2,'respondentType':'participant_self_report','source':{'title':'Automatic Thoughts Questionnaire (ATQ), 30-item frequency version','citation':citation,'url':src,'publicationYear':1980},
'license':{'status':'unknown','redistribution':'unknown','note':'题文转录自第三方公开教学网站（dradamvolungis.com）发布的题本，原作者为 Hollon & Kendall (1980)；该资料未声明再分发条款。未取得作者或出版方授权，不声称商业、翻译或再分发授权；正式发布前须与原版核对并确认权利。'},
'display':{'randomizeItems':False},'responseSets':[{'key':'atq_frequency_1_5','options':[{'value':'1','label':'not at all','score':1},{'value':'2','label':'sometimes','score':2},{'value':'3','label':'moderately often','score':3},{'value':'4','label':'often','score':4},{'value':'5','label':'all the time','score':5}]}],
'items':[{'itemCode':code(i),'content':x,'type':'single','required':True,'sortOrder':i-1,'responseSetKey':'atq_frequency_1_5','randomizeOptions':False} for i,x in enumerate(items,1)],
'scoring':{'scoringVersion':'1.0.0','itemRules':[{'itemCode':code(i),'transform':{'type':'identity'}} for i in range(1,31)],'defaultMissingPolicy':{'type':'complete_required'},'scores':scores},
'report':{'reportVersion':'1.0.0','primaryScoreKeys':['total'],'scoreOrder':list(refs),'interpretations':interpretations,'limitations':['分数反映“念头出现的频率”，不代表念头为真，也不代表个人品质。','原验证样本为美国大学生与成人；不构成儿童青少年常模。','没有常模、百分位或临床界值；分数不能用于抑郁诊断或疗效判定。','各分数必须完整作答是产品保守约定；缺答不会算零。','题文转录自第三方资料，发布前须与原版逐题核对。'],'disclaimer':'仅供认识与反思，不用于诊断、高风险决策或替代专业帮助。若消极念头持续加重或出现伤害自己的念头，请及时联系可信任的人或专业心理支持。'},'referencePolicy':{'type':'none'}},'goldenCases':fixtures}}
(p/'native/instrument.ts').write_text("import type { ScaleInstrumentSourceV1 } from '../../../onboarding/types'\n\n// English item text transcribed from the publicly posted ATQ/ATQ-B form (Hollon & Kendall, 1980); license unverified.\nexport const SCALE_INSTRUMENT_SOURCE = "+json.dumps(obj,ensure_ascii=False,indent=2)+" satisfies ScaleInstrumentSourceV1\n")
print('atq30 native written')
