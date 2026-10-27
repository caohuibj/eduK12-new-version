import type {ReactNode} from 'react'
import {SchoolTaskHelp} from './SchoolTaskHelp'

export function SchoolReportHeader({title,label,compact,children}:{title:string;label:string;compact:boolean;children:ReactNode}){
 return compact?<header className="hs-report-heading"><h2>{title}</h2><SchoolTaskHelp label={label} buttonText="使用说明">{children}</SchoolTaskHelp></header>:<><h2>{title}</h2>{children}</>
}
