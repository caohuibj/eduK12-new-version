# Fast Track 社会能力量表：教师25题与家长12题

来源：Conduct Problems Prevention Research Group / Fast Track Project，[教师版](https://fasttrackproject.org/measure/social-competence-teacher/)、[家长版](https://fasttrackproject.org/measure/social-competence-parent/)，[教师题本](https://fasttrackproject.org/wp-content/uploads/sites/2/2021/08/sct.pdf)、[家长题本](https://fasttrackproject.org/wp-content/uploads/sites/2/2021/08/socialcompetenceparent.pdf)，[教师SAS](https://fasttrackproject.org/wp-content/uploads/sites/2/2021/08/Social-Competence-Teacher.txt)、[家长SAS](https://fasttrackproject.org/wp-content/uploads/sites/2/2021/08/Social-Competence-Parent.txt)。项目页明确两版均可供公众使用，引用项目来源；题本标有来源与署名信息。翻译与数字化范围并无单独明确声明，中文为工作译稿，不声称是官方/已验证译本。[英文题文可读对照](https://archive.lib.cmu.ac.th/full/T/2015/biomed70515sjt_app.pdf)第6–7 PDF页逐题呈现两版；项目官方扫描PDF在当前环境无法提取文本，逐题结合官方项目页顺序和可读对照核对，未声称视觉复核扫描原件全部细节。

家长观察者与教师观察者分别作答，不混为学生自评，也不直接比较为彼此等值。教师覆盖亲社会与沟通、情绪调节、学习活动；其25题总分包含学习活动，不称为纯社会情绪总分。原研究教师样本覆盖幼儿园至三年级，家长覆盖幼儿园至二年级，不能推广为所有年龄段常模。

0–4 原始五选项、同向计分；分别对每个维度取均值。教师题键：亲社会9/13/19/20/22/23/24/25；情绪调节2/3/6/7/8/11/12/14/16/18；学业1/4/5/10/15/17/21；合并为亲社会+调节18题，全部25题另有均值。家长题键：亲社会4/7/9/10/11/12；调节1/2/3/5/6/8，另全部12题均值。详情及原始题序索引见 data.json。

官网说明超过半数缺答不计；两份SAS代码运行条件均允许恰好一半题有答，计算已答均值，尽管注释声称缺答达半数不计，二者表述冲突。当前实现出于保守而选 complete_required（各分数只有相关题全答才计算），这一要求严于原程序，不是原始规则；从不把缺答填0。没有发明常模、阈值或诊断意义。
