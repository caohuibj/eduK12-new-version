export type EducationRosterApi=<T>(path:string,method?:string,data?:unknown,options?:{responseType?:'blob'})=>Promise<T>
export type RosterKind='GRADE'|'CLASS'|'STUDENT'|'STAFF'|'ASSIGNMENT'
export type RosterUnit={id:string;unitKind:'GRADE'|'CLASS';name:string;parentUnitId:string|null}
export type RosterRecord={line:number;cells:string[];numeric?:number[]}
export type RosterSheet={name:string;rows:RosterRecord[]}
