import type {ReactNode} from 'react'
import {ChevronDown} from 'lucide-react'

export default function TrainingResourceActions({children,label='授权与管理'}:{children:ReactNode;label?:string}){
 return <details className="training-resource-actions"><summary>{label}<ChevronDown size={15} aria-hidden="true"/></summary><div className="training-resource-action-content">{children}</div></details>
}
