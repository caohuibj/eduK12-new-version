export type AssessmentListState={pending:boolean;error:boolean;count:number}
export type AssessmentListPresentation={
  unified?:boolean
  onListStateChange?:(state:AssessmentListState)=>void
}
export function assessmentStatus(status:string){
  return ({ASSIGNED:'待完成',STARTED:'进行中',COMPLETED:'已完成',CANCELLED:'已取消',WITHHELD:'暂未开放'} as Record<string,string>)[status]??'状态待确认'
}
