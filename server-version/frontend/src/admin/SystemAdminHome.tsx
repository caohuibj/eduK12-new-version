import {Navigate} from 'react-router-dom'
/** Stable login URL enters the first working tab directly. */
export default function SystemAdminHome(){return <Navigate to="/admin/permissions" replace/>}
