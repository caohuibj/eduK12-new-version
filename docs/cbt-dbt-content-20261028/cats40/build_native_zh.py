import json
from pathlib import Path
p=Path(__file__).parent
mapping=json.loads((p/'scoring.json').read_text())
items=[
"其他同学会认为我蠢",
"我有权向那些罪有应得的人报复",
"我做任何事都做得不对",
"我将会遭遇意外",
"其他同学都是蠢的",
"我担心将会被人嘲弄",
"我将要发疯了",
"其他同学会取笑我",
"我将会死亡",
"大部份人都针对我",
"我没有价值",
"我的父母将会受伤",
"再没有什么事情是顺意的",
"我会在别人面前表现得很蠢",
"我不会放过那些针对我的人",
"我害怕自己会失控",
"事情出错是因为我的过失",
"其他人都在想我差劲的一面",
"若有人伤害我，我有权去伤害他们",
"我将会受伤",
"我担心其他同学如何看我",
"有些人应该得到他们的报应",
"我把自己的生活弄得一团糟",
"有些可怕的事情将要发生",
"我看起来好像一个傻瓜",
"我永远不能像别人那样好",
"我经常因一些我没有做错的事被人责怪",
"我是一个失败者",
"其他同学爱拿我来开玩笑",
"人生没有生存价值",
"所有人都望着我",
"我害怕会令自己出丑",
"我害怕有人可能会死去",
"我永远不能克服我的问题",
"其他人总想给我找麻烦",
"我一定有些地方很有问题",
"有些人是很坏的",
"我憎恨自己",
"有些事情会发生在我所关心的人身上",
"坏人是应该受到惩罚的" ]
reverse=mapping['reverse_items'];dimensions=mapping['dimensions']; code=lambda i:f'CATS-{i:02}'
citation='Schniering CA, Rapee RM. (2002). Development and validation of a measure of children’s automatic thoughts: The Children’s Automatic Thoughts Scale. Behaviour Research and Therapy, 40(4), 471–487. 中文版：© Centre for Emotional Health, Macquarie University；Translated by © Dr Sun Ling, Beijing Normal University.'
src='https://www.mq.edu.au/__data/assets/pdf_file/0007/78865/CATS_Chinese_copyright_2015.pdf'
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
(p/'sample-responses-zh.json').write_text(json.dumps(sample,indent=2))
caps={'numericScores':True,'references':False,'individualInterpretations':True,'scoreDerivedLabels':False,'resultQualityDetails':True,'rawAnswers':False,'itemScores':False,'methods':True,'educationalContent':False}
obj={'schemaVersion':1,'identity':{'instrumentKey':'cats40_zh_cn','instrumentVersion':'1.0.0'},
'catalog':{'schemaVersion':1,'catalogManifestVersion':1,'catalogStatus':'CANDIDATE','scientificMaturity':'PILOT','identity':{'canonicalName':'儿童自动思维量表（CATS）中文版，儿童自评40题','abbreviation':'CATS 中文版','instrumentFamily':'Children’s Automatic Thoughts Scale'},
'construct':{'primaryDomain':'SELF_REGULATION','secondaryDomains':['BEHAVIORAL_DIFFICULTIES'],'constructDefinition':'儿童青少年自评过去一周消极自动思维（身体威胁、社交威胁、个人失败、敌意倾向）出现的频率；官方简体中文版。','constructLevel':'SPECIFIC_CONSTRUCT','constructOverlapTags':['domain:cbt','construct:cbt_cats_negative_automatic_thoughts','automatic_thoughts','child_adolescent_self_report','population:k12','response:student_self','use:reflection','use:research','language_validation:official_translation_review_pending','license:license_unverified']},
'population':{'populationNotes':'英文原版验证为7–16岁儿童青少年（Schniering & Rapee, 2002）；本中文版为版权方官网公开的官方译本（译者署名：北京师范大学孙玲），未见独立中文心理测量学验证研究，故语言验证标记为待复核。译文含港式用语（“大部份”“频密”），指导语作“过去一个周”而表头作“过去一星期”，用语不一致处按原文保留；正式施测前建议完成译文复核。','respondentTypes':['SELF'],'minAge':7,'maxAge':16,'developmentalEvidence':'ESTABLISHED'},
'administration':{'itemCount':40,'estimatedMinutes':10,'administrationModes':['DIGITAL_SELF_ADMINISTERED','DIGITAL_SUPERVISED','PAPER'],'timeFrame':'过去一周','requiredTraining':False,'itemOrderLocked':True,'responseFormatLocked':True,'layoutConstraints':['题序与英文版一一对应，四个分量表归属不变。','表头句式「过去一星期里，我想过……」与指导语“过去一个周内”按原文保留，未统一。','选项文字：完全没有0/很少1/有时2/经常3/总是4。']},
'intendedUse':{'intendedUses':[{'use':'RESEARCH','evidenceStatus':'SUPPORTED','notes':'构念证据来自英文原版；中文版为官方译本，未见独立中文验证。'},{'use':'INDIVIDUAL_REFLECTION','evidenceStatus':'EVIDENCE_UNKNOWN','notes':'频率反馈不构成诊断；第30题（人生没有生存价值）等条目若持续高分应由专业人员跟进。'}],'forbiddenUses':['DIAGNOSIS','HIGH_STAKES_SELECTION','SCHOOL_RANKING','TEACHER_ACCOUNTABILITY','UNSUPPORTED_GROUP_COMPARISON']},
'evidence':[{'evidenceId':'schniering-rapee-cats-2002','evidenceType':'STRUCTURAL_VALIDITY','population':'Australian children and adolescents aged 7–16 (clinical and community samples), English original','locale':'en','territory':'AU','studyDesign':'Scale development with four-factor structure and treatment sensitivity in anxious youth.','rating':'SUFFICIENT','citation':citation,'url':src,'notes':'该证据对应英文原版；中文版的题项归属沿用官方计分说明（四个分量表与英文版一致）。官方临床界值仅登记、不用于产品反馈。'}],'referenceApplicability':[]},
'applicability':{'schemaVersion':1,'policyVersion':'cats40-zh-cn-v1','respondentTypes':['SELF'],'requiredContextKeys':[]},
'disclosure':{'schemaVersion':1,'policyVersion':'cats40-zh-cn-v1','audiences':{a:dict(caps) for a in ['respondent','subject','teacher','researcher']},'unknownAudience':'DENY'},
'instruction':{'schemaVersion':1,'text':'以下的句子是一些孩子或青少年的想法。请仔细阅读每一句，并在其右方合适的数字上，以表示该想法在你过去一个周内出现的频密程度。','language':'zh-CN','version':'1.0.0','source':'版权方中文版题本第1页指导语，逐字转录（含“过去一个周”原文用语）。'},
'executable':{'releaseStatus':'DRAFT','contentLocale':'zh-CN','references':[],
'definition':{'schemaVersion':2,'respondentType':'participant_self_report','source':{'title':'儿童自动思维量表（CATS）中文版','citation':citation,'url':src,'publicationYear':2002},
'license':{'status':'unknown','redistribution':'unknown','note':'中文版题本 © Centre for Emotional Health, Macquarie University；Translated by © Dr Sun Ling, Beijing Normal University。经版权方官网资源页公开提供（copyright 2015 文件）；页面未列明再分发或商业条款。未取得授权声明；正式发布或商业使用前须与版权方确认。'},
'display':{'randomizeItems':False},'responseSets':[{'key':'cats_frequency_0_4','options':[{'value':'0','label':'完全没有','score':0},{'value':'1','label':'很少','score':1},{'value':'2','label':'有时','score':2},{'value':'3','label':'经常','score':3},{'value':'4','label':'总是','score':4}]}],
'items':[{'itemCode':code(i),'content':x,'type':'single','required':True,'sortOrder':i-1,'responseSetKey':'cats_frequency_0_4','randomizeOptions':False} for i,x in enumerate(items,1)],
'scoring':{'scoringVersion':'1.0.0','itemRules':[{'itemCode':code(i),'transform':{'type':'identity'}} for i in range(1,41)],'defaultMissingPolicy':{'type':'complete_required'},'scores':scores},
'report':{'reportVersion':'1.0.0','primaryScoreKeys':['social_threat','physical_threat','personal_failure','hostile_intent'],'scoreOrder':list(refs),'interpretations':interpretations,'limitations':['分数反映念头出现的频率，不代表念头为真，也不定义一个人。','官方计分表印有临床界值；产品不使用界值、等级或标签。','构念与计分证据来自英文原版；中文版为官方译本，未见独立中文验证研究，译文含港式用语且时段用语不一致（已按原文保留）。','各分数必须完整作答是产品保守约定；缺答不会算零。','题本转录自版权方官网公开文件，权利状态未确认。'],'disclaimer':'仅供认识与反思，不用于诊断、高风险决策或替代专业帮助。若出现“人生没有生存价值”等念头持续加重，请立即告诉可信任的大人或联系专业支持。'},'referencePolicy':{'type':'none'}},'goldenCases':fixtures}}
(p/'native/instrument_zh.ts').write_text("import type { ScaleInstrumentSourceV1 } from '../../../onboarding/types'\n\n// Official simplified-Chinese CATS © Centre for Emotional Health, Macquarie University; Translated by © Dr Sun Ling, Beijing Normal University; license unverified.\nexport const SCALE_INSTRUMENT_SOURCE = "+json.dumps(obj,ensure_ascii=False,indent=2)+" satisfies ScaleInstrumentSourceV1\n")
print('cats40_zh_cn native written')
