import type { IndividualProjection } from '../../api/reporting'
/** Renders only server-frozen, audience-filtered observations. No client recalibration. */
export function ScaleReferenceTrajectory({projection}:{projection:IndividualProjection}) {
 if(!projection.referenceTrajectories) return null
 return <section className="space-y-3" aria-label="多次测量的参考位置">
  <h3>看看这几次的变化</h3>
  {Object.entries(projection.referenceTrajectories.metrics).map(([key,snapshot])=><article className="rounded border p-3" key={key}>
   <p>{snapshot.compatibilityDecision==='COMPATIBLE_LATER_REFERENCE'?'这几次使用同一个参考范围，方便你看自己的变化。':'这几次按各自适用的参考范围说明，区间名称不能直接当成进步或退步。'}</p>
   <ol>{snapshot.points.map((point,i)=><li key={point.resultVersion}>第 {i+1} 次：{point.rawValue===null?'暂无可用得分':point.rawValue.toFixed(2)} · {point.reference?.status==='available' ? (point.reference.criterionBand?.label??'已有匹配参考') : '暂无匹配参考'}</li>)}</ol>
   <p>这是几次作答的记录。一次变化可能与最近的课堂、题目或心情有关，需要结合你的经历理解。</p>
   <details><summary>查看本报告的参考范围</summary><p>参考版本：{snapshot.selectedReferenceVersions.join('、')}。本报告生成后保持不变。</p></details>
  </article>)}
 </section>
}
