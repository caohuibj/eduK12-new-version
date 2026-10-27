# -*- coding: utf-8 -*-

import json
from pathlib import Path
p=Path(__file__).parent
D=[
('self_concept','自我觉察：自我概念',[
('Knowing what my strengths are','知道自己的长处是什么',1),('Knowing how to get better at things that are hard for me to do at school','知道怎样把在学校里觉得困难的事情做得更好',0),('Knowing when I am wrong about something','知道自己什么时候弄错了',0),('Knowing when I can’t control something','知道什么时候有些事情我无法控制',0)]),
('emotion_knowledge','自我觉察：情绪知识',[
('Knowing when my feelings are making it hard for me to focus','知道什么时候自己的感受让我难以集中注意力',1),('Knowing the emotions I feel','知道自己感受到的情绪',1),('Knowing ways to make myself feel better when I’m sad','知道难过时怎样让自己感觉好一些',0),('Noticing what my body does when I am nervous','注意到自己紧张时身体的反应',0),('Knowing when my mood affects how I treat others','知道什么时候自己的心情会影响我对待他人的方式',0),('Knowing ways I calm myself down','知道让自己平静下来的方法',1)]),
('social_awareness','社会觉察',[
('Learning from people with different opinions than me','向与我意见不同的人学习',1),('Knowing what people may be feeling by the look on their face','从他人的表情知道他们可能有什么感受',1),('Knowing when someone needs help','知道什么时候有人需要帮助',1),('Knowing how to get help when I’m having trouble with a classmate','与同学相处遇到困难时，知道怎样寻求帮助',0),('Knowing how my actions impact my classmates','知道自己的行为会怎样影响同学',0)]),
('emotion_regulation','自我管理：情绪调节',[
('Getting through something even when I feel frustrated','即使感到沮丧，也能挺过困难',1),('Being patient even when I am really excited','即使非常兴奋，也能耐心等待',1),('Staying calm when I feel stressed','感到有压力时保持平静',0),('Working on things even when I don’t like them','即使不喜欢，也能继续做事情',0)]),
('goal_management','自我管理：目标管理',[
('Finishing tasks even if they are hard for me','即使任务对我来说很难，也能完成',1),('Setting goals for myself','为自己设定目标',1),('Reaching goals that I set for myself','实现自己设定的目标',0),('Thinking through the steps it will take to reach my goal','仔细想清楚实现目标需要哪些步骤',0)]),
('school_work','自我管理：学校功课',[
('Doing my schoolwork even when I do not feel like it','即使不想做，也能做学校功课',1),('Being prepared for tests','为考试做好准备',1),('Working on assignments even when they are hard','即使作业很难，也能继续完成',0),('Planning ahead so I can turn a project in on time','提前计划，以便按时交项目作业',0),('Finishing my schoolwork without reminders','不需要提醒就完成学校功课',0),('Staying focused in class even when there are distractions','即使有干扰，上课时也能保持专注',0)]),
('relationship_skills','人际关系技能',[
('Respecting a classmate’s opinions during a disagreement','与同学意见不一致时尊重对方的观点',1),('Getting along with my classmates','与同学友好相处',1),('Sharing what I am feeling with others','与他人分享自己的感受',0),('Talking to an adult when I have problems at school','在学校遇到问题时，和一位成年人谈谈',0),('Being welcoming to someone I don’t usually eat lunch with','友好接纳平时不和我一起吃午饭的人',0),('Getting along with my teachers','与老师友好相处',0)]),
('responsible_decision','负责任的决策',[
('Thinking about what might happen before making a decision','做决定前想想可能会发生什么',1),('Knowing what is right or wrong','知道什么是对的、什么是错的',1),('Thinking of different ways to solve a problem','想出解决问题的不同方法',0),('Saying “no” to a friend who wants to break the rules','对想要违反规则的朋友说“不”',0),('Helping to make my school a better place','帮助让学校变得更好',0)])]
items=[]; dims=[]
for key,name,rows in D:
 ids=[]
 for en,zh,short in rows:
  i=len(items)+1; ident=f'wc{i:02d}'; ids.append(ident); items.append(dict(id=ident,table2_position=i,dimension=key,english=en,zh_working_translation=zh,in_17=bool(short),source='Cheung & Ng 2024, Table 2'))
 dims.append(dict(id=key,name=name,item_ids=ids,short_item_ids=[x['id'] for x in items if x['dimension']==key and x['in_17']]))
assert len(items)==40 and sum(x['in_17'] for x in items)==17
out={'id':'wcsd-seca','versions':{'40':{'reporter':'student_self_report','items':[x['id'] for x in items]},'17':{'reporter':'student_self_report','items':[x['id'] for x in items if x['in_17']]}},'prompt_zh_working':'对你来说，做到下面每件事有多难或多容易？','options':[{'value':1,'en':'Very difficult','zh':'非常困难'},{'value':2,'en':'Difficult','zh':'困难'},{'value':3,'en':'Easy','zh':'容易'},{'value':4,'en':'Very easy','zh':'非常容易'}],'dimensions':dims,'items':items,'tags':['SEL','学生自评','5至12年级','社会情绪能力'],'source':{'paper':'https://pmc.ncbi.nlm.nih.gov/articles/PMC11117818/','attribution':'Cheung RYM, Ng OOS. Behavioral Sciences. 2024;14(5):399. doi:10.3390/bs14050399','paper_license':'CC BY 4.0 https://creativecommons.org/licenses/by/4.0/','response_options_source':'https://pmc.ncbi.nlm.nih.gov/articles/PMC12882773/','original_site':'https://www.washoeschools.net/directory/accountability/school-climate/social-emotional-assessment','translation':'中文为基于论文英文题文的工作译文，并非香港研究所用已验证中文题文。'},'scoring_policy':{'direction':'1至4，越高表示学生自评越容易；无反向题','dimension':'每维全部题目完成时计算该维题目均值；缺任何题该维不计算。此为透明展示策略，非论文确认的缺答规则。','total':'不以分维平均值机械生成总分。','short_version':'官网定位为总体能力简表；八维仅作探索性题目反馈，尤其自我概念仅一题。'}}
(p/'instrument.json').write_text(json.dumps(out,ensure_ascii=False,indent=2)+'\n')
