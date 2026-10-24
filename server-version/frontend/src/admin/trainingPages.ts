/** Presentation routes; every page still requires the explicit TRAINING grant. */
export const trainingAdminPages=[
  {key:'accounts',path:'/admin/training/accounts',label:'用户管理'},
  {key:'courses',path:'/admin/training/courses',label:'课程监管'},
  {key:'resources',path:'/admin/training/resources',label:'资源与授权'},
] as const
export const trainingAdminPage=(path:string)=>trainingAdminPages.find(page=>page.path===path.replace(/\/$/,''))
export const trainingAdminProfilePath='/admin/training/profile'
export const isTrainingAdminPath=(path:string)=>path.replace(/\/$/,'')==='/admin/training'||Boolean(trainingAdminPage(path))||path.replace(/\/$/,'')===trainingAdminProfilePath
