/** Descriptive statistics over finite observations. Scale before subtraction
 * and squaring so valid NUMBER answers do not overflow intermediate sums.
 * The same constant-space accumulator serves full and paged analytics.
 */
export function createSurveyNumericSummary(){
  let n=0,scale=0,mean=0,m2=0
  return {
    add(value:number){
      const magnitude=Math.abs(value)
      if(magnitude>scale){
        const ratio=scale/magnitude
        mean*=ratio
        m2*=ratio*ratio
        scale=magnitude
      }
      const normalized=scale===0?0:value/scale
      n++
      const delta=normalized-mean
      mean+=delta/n
      m2+=delta*(normalized-mean)
    },
    result():{mean:number|null;sd:number|null}{
      if(!n)return {mean:null,sd:null}
      const sd=n>1?Math.sqrt(Math.max(0,m2)/(n-1))*scale:null
      // The mathematical sample SD itself can exceed Number.MAX_VALUE even
      // when every observation and their mean are finite. Keep it unavailable.
      return {mean:mean*scale,sd:sd!==null&&Number.isFinite(sd)?sd:null}
    },
  }
}
