import type {SchoolApi} from './SchoolRecovery'
import {SchoolGroupReports} from './SchoolGroupReports'
/** Keep the existing School entry; sources page through the same manager catalog.
 * A single selected task resolves its published plan, rather than arbitrary Runs. */
export function SchoolGroupLongitudinal(props:{api:SchoolApi;organizationId:string;compact?:boolean}){
 return <SchoolGroupReports {...props} longitudinalOnly/>
}
