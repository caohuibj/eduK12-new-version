/** Shared error without loading the database in pure export/analysis code. */
export class SurveyAnalyticsError extends Error {
  constructor(readonly statusCode:number,message:string){super(message)}
}
