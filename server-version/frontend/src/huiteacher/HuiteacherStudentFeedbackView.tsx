type Distribution={
  itemKey:string;prompt:string;type:string;status:'READY'|'WITHHELD';
  reason?:string;cells?:Array<{key:string;label:string;count:number}>
}
export type StudentFeedbackReport={
  source:'VERIFIED_HUITEACHER_STUDENT_FORM_FINAL';
  eventId:string;teacherName:string;formTitle:string;definitionDigest:string;
  frozenPopulation:number;independentRespondents:number;
  participationRate:number;minimumRespondents:number;releasedAt:string;
  distributions:Distribution[];withheldFreeText:true;reportMode:'FORM_DESCRIPTIVE_AGGREGATE';
  note:string
}
export function HuiteacherStudentFeedbackView({report}:{report:StudentFeedbackReport}){
  return <section className="ht-report" aria-label="身份受保护的学生评教群体反馈">
    <h4>{report.teacherName} · {report.formTitle}</h4>
    <p><strong>有效学生反馈：{report.independentRespondents} / {report.frozenPopulation}</strong>
      {' · '}参与率 {Math.round(report.participationRate*100)}%
      {' · '}披露下限 {report.minimumRespondents} 人</p>
    <p>报告发布时间：{new Date(report.releasedAt).toLocaleDateString('zh-CN')}
      {' · '}问卷版本：<code>{report.definitionDigest.slice(0,12)}…</code></p>
    <p>身份受保护，非绝对匿名。教师和学校管理者无法读取逐人答案、个人时间戳或开放意见原文。</p>
    {report.distributions.map(item=><article key={item.itemKey}>
      <h5>{item.prompt}</h5>
      {item.status==='WITHHELD'
        ?<p className="ht-muted">{item.reason==='PRIVATE_FREE_TEXT'
          ?'开放意见默认不披露，防止从文字内容识别学生。'
          :item.reason==='SMALL_CELL'
            ?'部分选项或其补集人数过少，本题整体抑制。'
            :'尚无受控披露的群体统计结果。'}</p>
        :<div className="ht-units">{item.cells?.map(cell=>
          <span className="ht-tag" key={cell.key}>{cell.label}：{cell.count}</span>
        )}</div>}
    </article>)}
    <p className="ht-muted">{report.note}</p>
  </section>
}
