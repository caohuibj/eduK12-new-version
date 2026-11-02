type Distribution={
  itemKey:string;prompt:string;type:string;status:'READY'|'WITHHELD';
  descriptive?:{version:'ordinal-description-v1';validN:number|null;submittedN:number|null;frequencies:Array<{key:string;label:string;percentage:number}>};
  reason?:string;cells?:Array<{key:string;label:string;count?:number;percentage?:number}>
}
export type StudentFeedbackReport={
  source:'VERIFIED_HUITEACHER_STUDENT_FORM_FINAL'|'VERIFIED_HUITEACHER_STUDENT_COMPOSITION_FINAL';
  eventId:string;teacherName:string;formTitle:string;definitionDigest:string;
  frozenPopulation:number|null;independentRespondents:number|null;
  participationRate:number|null;minimumRespondents:number;releasedAt:string;
  distributions:Distribution[];withheldFreeText:true;reportMode:'FORM_DESCRIPTIVE_AGGREGATE'|'COMPOSITION_DESCRIPTIVE_AGGREGATE';
  units?:Array<{blockId:string;kind:'FORM'|'SCALE';title:string;versionId:string;contentHash:string;state?:string;
    exploratoryMeans?:Array<{key:string;label:string;status:'READY'|'WITHHELD';mean:number|null;validN?:number;missingN?:number}>;
    distributions?:Distribution[];metrics?:Array<{key:string;label:string;status:'READY'|'WITHHELD';mean:number|null;validN?:number;missingN?:number;displayPrecision?:number}>}>;
  note:string
}
export function HuiteacherStudentFeedbackView({report}:{report:StudentFeedbackReport}){
  const distribution=(item:Distribution)=><article key={item.itemKey}>
    <h5>{item.prompt}</h5>
    {item.status==='WITHHELD'
      ?<p className="ht-muted">{item.reason==='PRIVATE_FREE_TEXT'
        ?'开放意见默认不披露，防止从文字内容识别学生。'
        :item.reason==='SMALL_CELL'
          ?'部分选项或其补集人数过少，本题整体抑制。'
          :'尚无受控披露的群体统计结果。'}</p>
      :<><div className="ht-units">{item.cells?.map(cell=>
        <span className="ht-tag" key={cell.key}>{cell.label}：{cell.count??(cell.percentage===undefined?'受限':cell.percentage+'%')}</span>
      )}</div>{item.descriptive&&<div aria-label="有效回答频率分布"><p>提交 {item.descriptive.submittedN??'受限'} 人；本题有效类别回答 {item.descriptive.validN??'受限'} 人。下列频率比例以本题有效回答人数为分母：</p>
       {item.descriptive.frequencies.map(cell=><span className="ht-tag" key={cell.key}>{cell.label}：{cell.percentage.toLocaleString('zh-CN',{maximumFractionDigits:1})}%</span>)}
       <p>上方全部类别、未遇到／无法判断、拒答及跳过比例以提交人数为分母；受限统计按披露精度显示。</p></div>}</>}
  </article>
  return <section className="ht-report" aria-label="身份受保护的学生评教群体反馈">
    <h4>{report.teacherName} · {report.formTitle}</h4>
    <p><strong>已提交学生反馈：{report.independentRespondents??'受限'} / {report.frozenPopulation??'受限'}</strong>
      {' · '}参与率 {report.participationRate===null?'受限':Math.round(report.participationRate*100)+'%'}
      {' · '}披露下限 {report.minimumRespondents} 人</p>
    <p>报告发布时间：{new Date(report.releasedAt).toLocaleDateString('zh-CN')}
      {' · '}问卷版本：<code>{report.definitionDigest.slice(0,12)}…</code></p>
    <p>身份受保护，非绝对匿名。教师和学校管理者无法读取逐人答案、个人时间戳或开放意见原文。</p>
    {report.distributions.map(distribution)}
    {report.units?.map(unit=><section key={unit.blockId} aria-label={unit.title+'群体反馈'}><h5>{unit.title} · {unit.kind==='SCALE'?'量表':'表单'} · 版本 {unit.contentHash.slice(0,12)}…</h5>
      {unit.kind==='FORM'?<><p>表单不计算量表分数。</p>{unit.distributions?.map(distribution)}{unit.exploratoryMeans?.map(group=><p key={group.key}>{group.label} · 预声明探索性完整题均值：{group.status==='READY'&&group.mean!==null?`${group.mean.toLocaleString('zh-CN',{maximumFractionDigits:2})}（完整作答 ${group.validN??'受限'} 人，未完整 ${group.missingN??'受限'} 人）`:'人数或隐私条件不满足，未披露'}。不代表能力或教学质量等级。</p>)}</>:
       unit.state==='WITHHELD'?<p>该固定版本未开放针对教师的量表群体统计。</p>:
       unit.metrics?.map(metric=><p key={metric.key}>{metric.label}：{metric.status==='READY'&&metric.mean!==null
         ?<>群体均值 {metric.mean.toLocaleString('zh-CN',{maximumFractionDigits:metric.displayPrecision??1})}（有效 {metric.validN??'受限'}，缺失 {metric.missingN??'受限'}）</>
         :'未达到本项人数或隐私披露条件，统计结果受限。'}</p>)}
    </section>)}
    <p className="ht-muted">{report.note}</p>
  </section>
}
