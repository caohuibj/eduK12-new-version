import json
from pathlib import Path
p=Path(__file__).parent
mapping=json.loads((p/'scoring.json').read_text())
items=[
"I notice changes in my body, such as whether my breathing slows down or speeds up.",
"I’m good at finding the words to describe my feelings.",
"When I do things, my mind wanders off and I’m easily distracted.",
"I criticize myself for having irrational or inappropriate emotions.",
"I pay attention to whether my muscles are tense or relaxed.",
"I can easily put my beliefs, opinions, and expectations into words.",
"When I’m doing something, I’m only focused on what I’m doing, nothing else.",
"I tend to evaluate whether my perceptions are right or wrong.",
"When I’m walking, I deliberately notice the sensations of my body moving.",
"I’m good at thinking of words to express my perceptions, such as how things taste, smell, or sound.",
"I drive on “automatic pilot” without paying attention to what I’m doing.",
"I tell myself that I shouldn’t be feeling the way I’m feeling.",
"When I take a shower or bath, I stay alert to the sensations of water on my body.",
"It’s hard for me to find the words to describe what I’m thinking.",
"When I’m reading, I focus all my attention on what I’m reading.",
"I believe some of my thoughts are abnormal or bad and I shouldn’t think that way.",
"I notice how foods and drinks affect my thoughts, bodily sensations, and emotions.",
"I have trouble thinking of the right words to express how I feel about things.",
"When I do things, I get totally wrapped up in them and don’t think about anything else.",
"I make judgments about whether my thoughts are good or bad.",
"I pay attention to sensations, such as the wind in my hair or sun on my face.",
"When I have a sensation in my body, it’s difficult for me to describe it because I can’t find the right words.",
"I don’t pay attention to what I’m doing because I’m daydreaming, worrying, or otherwise distracted.",
"I tend to make judgments about how worthwhile or worthless my experiences are.",
"I pay attention to sounds, such as clocks ticking, birds chirping, or cars passing.",
"Even when I’m feeling terribly upset, I can find a way to put it into words.",
"When I’m doing chores, such as cleaning or laundry, I tend to daydream or think of other things.",
"I tell myself that I shouldn’t be thinking the way I’m thinking.",
"I notice the smells and aromas of things.",
"I intentionally stay aware of my feelings.",
"I tend to do several things at once rather than focusing on one thing at a time.",
"I think some of my emotions are bad or inappropriate and I shouldn’t feel them.",
"I notice visual elements in art or nature, such as colors, shapes, textures, or patterns of light and shadow.",
"My natural tendency is to put my experiences into words.",
"When I’m working on something, part of my mind is occupied with other topics, such as what I’ll be doing later, or things I’d rather be doing.",
"I disapprove of myself when I have irrational ideas.",
"I pay attention to how my emotions affect my thoughts and behavior.",
"I get completely absorbed in what I’m doing, so that all my attention is focused on it.",
"I notice when my moods begin to change." ]
reverse=mapping['reverse_items'];dimensions=mapping['dimensions']; code=lambda i:f'KIMS-{i:02}'
citation='Baer RA, Smith GT, Allen KB. (2004). Assessment of mindfulness by self-report: The Kentucky Inventory of Mindfulness Skills. Assessment, 11(3), 191–206.'
src='https://www.ruthbaer.com/academics/KIMS.pdf'
refs=dimensions; labels={'observe':'观察','describe':'描述','act_awareness':'有觉知地行动','accept_without_judgment':'不评判地接纳'}
scores=[{'key':k,'type':'dimension','label':labels[k],'description':'相关题按反向键统一方向后求和；必须完整作答。','direction':'higher_is_more','canonical':True,'displayPrecision':0,'missingPolicy':{'type':'complete_required'},'source':{'type':'items','items':[{'itemCode':code(i),'weight':1} for i in ids],'aggregation':'sum'}} for k,ids in refs.items()]
interpretations=[
{'scoreKey':'observe','headline':'留心到的细节','source':{'type':'score_only'},'summary':'这组题关注你注意到身体感觉、声音、气味等内外体验的频率。观察本身没有好坏；在没有正念练习经验的人身上，这一项与其他技能的关系并不稳定，不必单独解读。','bands':[],'guidance':[{'category':'reflection','text':'今天你注意到了哪些平时忽略的感觉（风、光线、脚步）？'},{'category':'strategy','text':'选一段熟悉的路，走的时候刻意找出三种以前没注意过的声音。'}]},
{'scoreKey':'describe','headline':'把感受说出口','source':{'type':'score_only'},'summary':'这组题关注你能否为内心的感受和想法找到合适的词。能用语言标记情绪，往往让人更容易和它相处。','bands':[],'guidance':[{'category':'reflection','text':'最近一次情绪波动时，你心里最先冒出的词是什么？'},{'category':'strategy','text':'试着用“我注意到我正在感到……”开头，把此刻的感受写一句话。'}]},
{'scoreKey':'act_awareness','headline':'专注在当下的事','source':{'type':'score_only'},'summary':'这组题（含反向题）关注你做事时是否专注于当下，而不是自动导航或走神。分心是大脑的默认模式，发现分心就是重新专注的开始。','bands':[],'guidance':[{'category':'reflection','text':'你最容易“自动导航”的场景是什么（刷手机、吃饭、洗澡）？'},{'category':'strategy','text':'下一次发现自己走神时，停三秒，说出你正在做的事情的名字，再继续。'}]},
{'scoreKey':'accept_without_judgment','headline':'不急着评判','source':{'type':'score_only'},'summary':'这组题（全部反向计分）关注你是否允许想法和情绪存在、而不马上给它们打上好坏标签。接纳不代表喜欢或放弃改变，而是先如实地看见。','bands':[],'guidance':[{'category':'reflection','text':'你会因为自己“不该有某种情绪”而批评自己吗？什么时候开始的？'},{'category':'strategy','text':'下次情绪出现时，先在心里说“这个感受在这里”，再决定要不要行动。'}]}]
def fixture(name,answer,miss=[]):
 values={i:(6-answer[i] if i in reverse else answer[i]) for i in range(1,40) if i not in miss}
 return {'name':name,'answers':[{'itemCode':code(i),'responseValue':str(answer[i])} for i in range(1,40) if i not in miss],'expected':{'quality':'invalid' if miss else 'interpretable','scores':{k:(None if any(i in miss for i in ids) else sum(values[i] for i in ids)) for k,ids in refs.items()},'totalScoreKeys':list(refs)}}
high={i:1 if i in reverse else 5 for i in range(1,40)};low={i:5 if i in reverse else 1 for i in range(1,40)}
sample={i:(6-(4 if i in (1,5,9,13,17,21,25,29,30,33,37,39) else 3) if i in reverse else 4 if i in (1,5,9,13,17,21,25,29,30,33,37,39) else 3) for i in range(1,40)}
fixtures=[fixture('all-keyed-min',low),fixture('all-keyed-max',high),fixture('sample-observe4-rest3',sample),fixture('missing-describe',sample,[2])]
(p/'sample-responses.json').write_text(json.dumps(sample,indent=2))
caps={'numericScores':True,'references':False,'individualInterpretations':True,'scoreDerivedLabels':False,'resultQualityDetails':True,'rawAnswers':False,'itemScores':False,'methods':True,'educationalContent':False}
obj={'schemaVersion':1,'identity':{'instrumentKey':'kims39','instrumentVersion':'1.0.0'},
'catalog':{'schemaVersion':1,'catalogManifestVersion':1,'catalogStatus':'CANDIDATE','scientificMaturity':'PILOT','identity':{'canonicalName':'Kentucky Inventory of Mindfulness Skills','abbreviation':'KIMS','instrumentFamily':'Kentucky Inventory of Mindfulness Skills'},
'construct':{'primaryDomain':'SELF_REGULATION','secondaryDomains':[],'constructDefinition':'自评四类正念技能：观察、描述、有觉知地行动、不评判地接纳。','constructLevel':'SPECIFIC_CONSTRUCT','constructOverlapTags':['domain:dbt','construct:dbt_kims_mindfulness_skills','mindfulness','observe_describe_act_accept','adult_self_report','self_report','use:reflection','use:research','language_validation:english_original','license:license_unverified']},
'population':{'populationNotes':'原版验证样本为美国大学生及社区成人；未建立儿童青少年常模。青少年正念测评须使用适龄工具（如库内 CAMM-10），不得直接套用本工具。','respondentTypes':['SELF'],'developmentalEvidence':'ESTABLISHED'},
'administration':{'itemCount':39,'estimatedMinutes':12,'administrationModes':['DIGITAL_SELF_ADMINISTERED','DIGITAL_SUPERVISED','PAPER'],'timeFrame':'一般性描述（“对你而言通常是否属实”），无指定回忆时段','requiredTraining':False,'itemOrderLocked':True,'responseFormatLocked':True,'layoutConstraints':['保留原39题顺序与五点“真实性”选项。','18个反向题按官方计分键统一方向后计分。']},
'intendedUse':{'intendedUses':[{'use':'RESEARCH','evidenceStatus':'SUPPORTED','notes':'原版四因子结构在大学生样本验证。'},{'use':'INDIVIDUAL_REFLECTION','evidenceStatus':'EVIDENCE_UNKNOWN','notes':'技能频率反馈不构成疗效评估或临床判断。'}],'forbiddenUses':['DIAGNOSIS','HIGH_STAKES_SELECTION','SCHOOL_RANKING','TEACHER_ACCOUNTABILITY','UNSUPPORTED_GROUP_COMPARISON']},
'evidence':[{'evidenceId':'baer-kims-2004','evidenceType':'STRUCTURAL_VALIDITY','population':'US undergraduate and community adult samples','locale':'en','territory':'US','studyDesign':'Scale development with four-factor structure, internal consistency and convergent validity.','rating':'SUFFICIENT','citation':citation,'url':src,'notes':'官方计分只汇总四个分量表，不定义总分；观察维在无正念经验样本中与其他维相关较低。计分键誊自作者官网随表计分页。'}],'referenceApplicability':[]},
'applicability':{'schemaVersion':1,'policyVersion':'kims39-en-v1','respondentTypes':['SELF'],'requiredContextKeys':[]},
'disclosure':{'schemaVersion':1,'policyVersion':'kims39-en-v1','audiences':{a:dict(caps) for a in ['respondent','subject','teacher','researcher']},'unknownAudience':'DENY'},
'instruction':{'schemaVersion':1,'text':'Please rate each of the following statements using the scale provided. Write the number in the blank that best describes your own opinion of what is generally true for you.','language':'en','version':'1.0.0','source':'作者官网题本第1页前导语（ruthbaer.com）。'},
'executable':{'releaseStatus':'DRAFT','contentLocale':'en','references':[],
'definition':{'schemaVersion':2,'respondentType':'participant_self_report','source':{'title':'Kentucky Inventory of Mindfulness Skills (KIMS)','citation':citation,'url':src,'publicationYear':2004},
'license':{'status':'unknown','redistribution':'unknown','note':'题本及官方计分说明自开发者 Ruth Baer 官网公开下载；页面未列明确再分发或翻译条款。公开提供不等同于不限用途授权；正式发布或商业使用前须向作者确认。'},
'display':{'randomizeItems':False},'responseSets':[{'key':'kims_truth_1_5','options':[{'value':'1','label':'Never or very rarely true','score':1},{'value':'2','label':'Rarely true','score':2},{'value':'3','label':'Sometimes true','score':3},{'value':'4','label':'Often true','score':4},{'value':'5','label':'Very often or always true','score':5}]}],
'items':[{'itemCode':code(i),'content':x,'type':'single','required':True,'sortOrder':i-1,'responseSetKey':'kims_truth_1_5','randomizeOptions':False} for i,x in enumerate(items,1)],
'scoring':{'scoringVersion':'1.0.0','itemRules':[{'itemCode':code(i),'transform':{'type':'reverse' if i in reverse else 'identity'}} for i in range(1,40)],'defaultMissingPolicy':{'type':'complete_required'},'scores':scores},
'report':{'reportVersion':'1.0.0','primaryScoreKeys':['observe','describe','act_awareness','accept_without_judgment'],'scoreOrder':list(refs),'interpretations':interpretations,'limitations':['四个分量表各自独立，官方计分不定义总分；不同维度不可相加或互换解读。','原版验证样本为美国大学生与社区成人；不构成儿童青少年常模。','没有常模、百分位或技能等级；分数不能用于疗效判定。','各分数必须完整作答是产品保守约定；缺答不会算零。','题文与计分键誊自作者官网公开题本，权利状态未确认。'],'disclaimer':'仅供认识与练习参考，不用于诊断、高风险决策或替代专业帮助。'},'referencePolicy':{'type':'none'}},'goldenCases':fixtures}}
(p/'native/instrument.ts').write_text("import type { ScaleInstrumentSourceV1 } from '../../../onboarding/types'\n\n// English item text and official scoring key transcribed from the author-distributed KIMS form (ruthbaer.com); license unverified.\nexport const SCALE_INSTRUMENT_SOURCE = "+json.dumps(obj,ensure_ascii=False,indent=2)+" satisfies ScaleInstrumentSourceV1\n")
print('kims39 native written')
