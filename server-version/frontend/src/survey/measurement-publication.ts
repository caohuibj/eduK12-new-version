export type MeasurementTransport = <T>(path:string,method?:string,payload?:unknown)=>Promise<T>

// Both authoring and the compatible report entry publish exactly the saved
// instrument revision. Publication does not prepare/freeze a collection wave.
export function publishSurveyMeasurement(
  transport:MeasurementTransport,projectId:string,source:{id:string;revision:number},
){
  return transport<{releaseId:string}>(
    '/projects/'+encodeURIComponent(projectId)+'/instruments/'+encodeURIComponent(source.id)+'/measurement-release',
    'POST',{revision:source.revision},
  )
}
