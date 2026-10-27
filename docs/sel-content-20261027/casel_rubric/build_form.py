import json
from pathlib import Path
p=Path(__file__).parent
pdf='https://files.casel.org/sites/2/2019/06/Blank-Rubric-Template-3.30.20.pdf'
groups=[
('focus_1a','1A｜建立基础支持',1,[('team','SEL团队'),('foundational_learning','基础SEL学习机会'),('two_way_communication','双向沟通')]),
('focus_1b','1B｜制定共同计划',2,[('shared_vision','共同愿景'),('planning','计划'),('resources','资源')]),
('focus_2','2｜发展成人SEL能力',3,[('professional_learning','专业学习'),('adult_sel_culture','成人SEL与文化能力'),('staff_collaboration','教职工协作'),('staff_modeling','教职工示范')]),
('focus_3a','3｜支持学生SEL · 课堂',4,[('classroom_environment','支持性的课堂环境'),('explicit_instruction','明确的SEL教学'),('integrated_instruction','SEL融入学科教学')]),
('focus_3b','3｜支持学生SEL · 学校',5,[('cultural_responsiveness','文化回应'),('school_climate','学校氛围'),('evidence_based_programs','循证项目与实践'),('student_voice','学生声音与参与')]),
('focus_3c','3｜支持学生SEL · 支持与伙伴',6,[('discipline','纪律政策与实践'),('student_support','学生支持'),('family_partnerships','家庭伙伴关系'),('community_partnerships','社区伙伴关系')]),
('focus_4','4｜持续改进',7,[('improvement_resources','持续改进的资源'),('improvement_systems','持续改进的机制')])]
pages=[]
for group,title,pg,indicators in groups:
 questions=[]
 for key,label in indicators:
  qkey=group+'_'+key
  questions.append({'itemKey':qkey+'_level','type':'SINGLE','prompt':f'{label}：对照CASEL原量规第{pg}页该指标的四个行为描述，记录团队选择的水平。原文：{pdf}#page={pg}。尚未讨论或证据不足可留空。','required':False,'options':[{'optionKey':f'level_{i}','label':str(i)} for i in range(1,5)],'rows':[]})
  questions.append({'itemKey':qkey+'_evidence','type':'LONG_TEXT','prompt':f'{label}：哪些具体事实、材料或不同成员的观察支持这一判断？还有哪些信息缺失？','required':False,'options':[],'rows':[],'maxLength':1500})
  questions.append({'itemKey':qkey+'_action','type':'LONG_TEXT','prompt':f'{label}：下一步准备做什么，由谁负责，何时回顾？','required':False,'options':[],'rows':[],'maxLength':1000})
 pages.append({'pageKey':group,'title':title,'description':f'记录工具草稿：行为锚点不在本表中，须按使用条件查阅CASEL原量规第{pg}页；只记录学校层面的团队观察，不计算总分。','questions':questions})
obj={'schemaVersion':2,'pages':pages}
(p/'native/form.ts').write_text("import type { FormDraft } from '../../assessment-core/form/definition'\n\n// Recording-only draft. The original behavior anchors are not reproduced.\nexport const FORM_DEFINITION = "+json.dumps(obj,ensure_ascii=False,indent=2)+" satisfies FormDraft\n")
(p/'form.json').write_text(json.dumps(obj,ensure_ascii=False,indent=2))
print('pages',len(pages),'indicators',sum(len(g[3]) for g in groups),'fields',sum(len(x['questions']) for x in pages))
