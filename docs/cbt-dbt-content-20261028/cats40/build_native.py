import json
from pathlib import Path
p=Path(__file__).parent
mapping=json.loads((p/'scoring.json').read_text())
items=[
"Kids will think I’m stupid",
"I have the right to take revenge on people if they deserve it",
"I can’t do anything right",
"I’m going to have an accident",
"Other kids are stupid",
"I’m worried that I’m going to get teased",
"I’m going crazy",
"Kids are going to laugh at me",
"I’m going to die",
"Most people are against me",
"I am worthless",
"My mum or dad are going to get hurt",
"Nothing ever works out for me anymore",
"I’m going to look silly",
"I won’t let anyone get away with picking on me",
"I’m scared of losing control",
"It’s my fault that things have gone wrong",
"People are thinking bad things about me",
"If someone hurts me, I have the right to hurt them back",
"I’m going to get hurt",
"I’m afraid of what other kids will think of me",
"Some people deserve what they get",
"I’ve made such a mess of my life",
"Something awful is going to happen",
"I look like an idiot",
"I’ll never be as good as other people are",
"I always get blamed for things that are not my fault",
"I am a failure",
"Other kids are making fun of me",
"Life is not worth living",
"Everyone is staring at me",
"I’m afraid I will make a fool of myself",
"I’m scared that somebody might die",
"I will never overcome my problems",
"People always try to get me into trouble",
"There is something very wrong with me",
"Some people are bad",
"I hate myself",
"Something will happen to someone I care about",
"Bad people deserve to get punished" ]
reverse=mapping['reverse_items'];dimensions=mapping['dimensions']; code=lambda i:f'CATS-{i:02}'
citation='Schniering CA, Rapee RM. (2002). Development and validation of a measure of children’s automatic thoughts: The Children’s Automatic Thoughts Scale. Behaviour Research and Therapy, 40(4), 471–487.'
src='https://www.mq.edu.au/__data/assets/pdf_file/0007/520099/CATS_ChildReport_copyright_2015.pdf'
score_src='https://www.mq.edu.au/__data/assets/pdf_file/0011/366491/CATS_scoring_copyright_2016.pdf'
refs={**dimensions,'total':list(range(1,41))}; labels={'physical_threat':'身体威胁','social_threat':'社交威胁','personal_failure':'个人失败','hostile_intent':'敌意倾向','total':'全部40题总和'}
scores=[{'key':k,'type':'total' if k=='total' else 'dimension','label':labels[k],'description':'相关题作答直接求和（无反向题，0–4频率）；必须完整作答。','direction':'higher_is_more','canonical':k=='total','displayPrecision':0,'missingPolicy':{'type':'complete_required'},'source':{'type':'items','items':[{'itemCode':code(i),'weight':1} for i in ids],'aggregation':'sum'}} for k,ids in refs.items()]
interpretations=[
{'scoreKey':'social_threat','headline':'“别人会怎么看我”','source':{'type':'score_only'},'summary':'这组题统计与同学眼光有关的念头出现的频率——怕被嘲笑、怕出丑、觉得大家在盯着自己。这类念头在成长期很常见；频率高不代表别人真的这么想你。','bands':[],'guidance':[{'category':'reflection','text':'过去一周，哪个具体场景让这类念头出现得最多？当时实际发生了什么？'},{'category':'strategy','text':'下次念头出现时，试着把“他们会笑我”改写成一句可以验证的话，然后观察真实发生的版本。'}]},
{'scoreKey':'physical_threat','headline':'“会出事”的担心','source':{'type':'score_only'},'summary':'这组题统计关于受伤、生病、出意外的念头。担心安全是大脑的保护机制；但反复出现的“要出事了”并不等于预言。','bands':[],'guidance':[{'category':'reflection','text':'这些担心里，有没有一条已经在过去一周被证明“没有发生”？'},{'category':'strategy','text':'把担心写成两栏：“我担心的事”和“实际发生的事”，一周后回看对照。'}]},
{'scoreKey':'personal_failure','headline':'对自己的否定','source':{'type':'score_only'},'summary':'这组题统计“我不行、我是失败、我讨厌自己”一类对自我的否定念头。念头是想法，不是事实；它们的音量可以随练习变小。','bands':[],'guidance':[{'category':'reflection','text':'如果同样的事发生在好朋友身上，你会对他说这些话吗？'},{'category':'strategy','text':'把“我做不到”换成“我还没做到”，并写下一个具体的下一步。'}]},
{'scoreKey':'hostile_intent','headline':'“要讨回来”','source':{'type':'score_only'},'summary':'这组题统计与报复、惩罚他人有关的念头。愤怒是正常情绪，让它主导行为才是要留意的部分；被欺负时求助比报复更有效。','bands':[],'guidance':[{'category':'reflection','text':'这些念头出现时，你通常刚经历了什么？'},{'category':'strategy','text':'下次被激怒时先离开现场十分钟；如果有人持续欺负你，告诉一位可信任的大人。'}]},
{'scoreKey':'total','headline':'这周的念头记录','source':{'type':'score_only'},'summary':'总分汇总40个念头出现的频率，用于观察一周内的整体水平；它不是“想得好不好”的评分，更不能定义一个人。','bands':[],'guidance':[{'category':'reflection','text':'这一周里，哪几天的念头更吵？那些天发生了什么？'},{'category':'strategy','text':'选一个维度的一条念头做一周记录：念头→证据→更完整的版本。'}]}]
def fixture(name,answer,miss=[]):
 values={i:answer[i] for i in range(1,41) if i not in miss}
 return {'name':name,'answers':[{'itemCode':code(i),'responseValue':str(answer[i])} for i in range(1,41) if i not in miss],'expected':{'quality':'invalid' if miss else 'interpretable','scores':{k:(None if any(i in miss for i in ids) else sum(values[i] for i in ids)) for k,ids in refs.items()},'totalScoreKeys':list(refs)}}
low={i:0 for i in range(1,41)};high={i:4 for i in range(1,41)}
sample={i:(2 if i in dimensions['social_threat'] else 1) for i in range(1,41)}
fixtures=[fixture('all-keyed-min',low),fixture('all-keyed-max',high),fixture('sample-social2-rest1',sample),fixture('missing-social',sample,[1])]
(p/'sample-responses.json').write_text(json.dumps(sample,indent=2))
caps={'numericScores':True,'references':False,'individualInterpretations':True,'scoreDerivedLabels':False,'resultQualityDetails':True,'rawAnswers':False,'itemScores':False,'methods':True,'educationalContent':False}
obj={'schemaVersion':1,'identity':{'instrumentKey':'cats40','instrumentVersion':'1.0.0'},
'catalog':{'schemaVersion':1,'catalogManifestVersion':1,'catalogStatus':'CANDIDATE','scientificMaturity':'PILOT','identity':{'canonicalName':'Children’s Automatic Thoughts Scale, child self-report (40 items)','abbreviation':'CATS','instrumentFamily':'Children’s Automatic Thoughts Scale'},
'construct':{'primaryDomain':'SELF_REGULATION','secondaryDomains':['BEHAVIORAL_DIFFICULTIES'],'constructDefinition':'儿童青少年自评过去一周消极自动思维（身体威胁、社交威胁、个人失败、敌意倾向）出现的频率。','constructLevel':'SPECIFIC_CONSTRUCT','constructOverlapTags':['domain:cbt','construct:cbt_cats_negative_automatic_thoughts','automatic_thoughts','child_adolescent_self_report','population:k12','response:student_self','use:reflection','use:research','language_validation:english_original','license:license_unverified']},
'population':{'populationNotes':'原版验证为7–16岁儿童青少年临床与社区样本（Schniering & Rapee, 2002），适用于K12年龄段；ATQ为成人版，两版不得混用。麦考瑞官网另有简体中文版表单，但据第三方核对文件中可见繁体字形，中文路径未交付，中文施测前须核对语种并立新版本。','respondentTypes':['SELF'],'minAge':7,'maxAge':16,'developmentalEvidence':'ESTABLISHED'},
'administration':{'itemCount':40,'estimatedMinutes':10,'administrationModes':['DIGITAL_SELF_ADMINISTERED','DIGITAL_SUPERVISED','PAPER'],'timeFrame':'过去一周','requiredTraining':False,'itemOrderLocked':True,'responseFormatLocked':True,'layoutConstraints':['保留原40题顺序与0–4五档频率选项。','表头句式“Over the past week I thought…”按原文保留。']},
'intendedUse':{'intendedUses':[{'use':'RESEARCH','evidenceStatus':'SUPPORTED','notes':'原版在焦虑/抑郁青少年样本中验证，对治疗变化敏感。'},{'use':'INDIVIDUAL_REFLECTION','evidenceStatus':'EVIDENCE_UNKNOWN','notes':'频率反馈不构成诊断；第30题（Life is not worth living）等条目若持续高分应由专业人员跟进。'}],'forbiddenUses':['DIAGNOSIS','HIGH_STAKES_SELECTION','SCHOOL_RANKING','TEACHER_ACCOUNTABILITY','UNSUPPORTED_GROUP_COMPARISON']},
'evidence':[{'evidenceId':'schniering-rapee-cats-2002','evidenceType':'STRUCTURAL_VALIDITY','population':'Australian children and adolescents aged 7–16 (clinical and community samples)','locale':'en','territory':'AU','studyDesign':'Scale development with four-factor structure and treatment sensitivity in anxious youth.','rating':'SUFFICIENT','citation':citation,'url':src,'notes':'四因子题项归属与总分范围取自版权方随表分发的官方计分说明；官方临床界值仅记录、不用于产品反馈。无本地常模。'}],'referenceApplicability':[]},
'applicability':{'schemaVersion':1,'policyVersion':'cats40-en-v1','respondentTypes':['SELF'],'requiredContextKeys':[]},
'disclosure':{'schemaVersion':1,'policyVersion':'cats40-en-v1','audiences':{a:dict(caps) for a in ['respondent','subject','teacher','researcher']},'unknownAudience':'DENY'},
'instruction':{'schemaVersion':1,'text':'Listed below are some thoughts that children and adolescents have said pop into their heads. Please read each thought carefully and decide how often, if at all, each thought popped into your head over the past week. Circle your answer in the following way:','language':'en','version':'1.0.0','source':'版权方题本第1页 Instructions 段逐字转录（© Centre for Emotional Health, Macquarie University）。'},
'executable':{'releaseStatus':'DRAFT','contentLocale':'en','references':[],
'definition':{'schemaVersion':2,'respondentType':'participant_self_report','source':{'title':'Children’s Automatic Thoughts Scale (CATS), child report','citation':citation,'url':src,'publicationYear':2002},
'license':{'status':'unknown','redistribution':'unknown','note':'题本及官方计分说明 © Centre for Emotional Health, Macquarie University，经官网资源页公开提供（copyright 2015/2016 文件）；页面未列明再分发、翻译或商业条款。未取得授权声明；正式发布或商业使用前须与版权方确认。'},
'display':{'randomizeItems':False},'responseSets':[{'key':'cats_frequency_0_4','options':[{'value':'0','label':'Not at all','score':0},{'value':'1','label':'Sometimes','score':1},{'value':'2','label':'Fairly often','score':2},{'value':'3','label':'Often','score':3},{'value':'4','label':'All the time','score':4}]}],
'items':[{'itemCode':code(i),'content':x,'type':'single','required':True,'sortOrder':i-1,'responseSetKey':'cats_frequency_0_4','randomizeOptions':False} for i,x in enumerate(items,1)],
'scoring':{'scoringVersion':'1.0.0','itemRules':[{'itemCode':code(i),'transform':{'type':'identity'}} for i in range(1,41)],'defaultMissingPolicy':{'type':'complete_required'},'scores':scores},
'report':{'reportVersion':'1.0.0','primaryScoreKeys':['social_threat','physical_threat','personal_failure','hostile_intent'],'scoreOrder':list(refs),'interpretations':interpretations,'limitations':['分数反映念头出现的频率，不代表念头为真，也不定义一个人。','官方计分表印有临床界值；产品不使用界值、等级或标签，仅供研究参考。','原验证为澳大利亚7–16岁样本；不构成中文人群常模。','各分数必须完整作答是产品保守约定；缺答不会算零。','题本转录自版权方官网公开文件，权利状态未确认；中文路径未交付。'],'disclaimer':'仅供认识与反思，不用于诊断、高风险决策或替代专业帮助。若出现“活着没意思”等念头持续加重，请立即告诉可信任的大人或联系专业支持。'},'referencePolicy':{'type':'none'}},'goldenCases':fixtures}}
(p/'native/instrument.ts').write_text("import type { ScaleInstrumentSourceV1 } from '../../../onboarding/types'\n\n// English item text © Centre for Emotional Health, Macquarie University; transcribed from the officially posted child-report form, license unverified.\nexport const SCALE_INSTRUMENT_SOURCE = "+json.dumps(obj,ensure_ascii=False,indent=2)+" satisfies ScaleInstrumentSourceV1\n")
print('cats40 native written')
