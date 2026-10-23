import type { ComponentProps } from 'react'
import { TrainingMaterialPicker, TrainingMaterialPreview } from '../modules/assessment-media/TrainingMaterialPicker'
import { ScaleDefinitionEditor } from './ScaleDefinitionEditor'

type Props = Omit<ComponentProps<typeof ScaleDefinitionEditor>, 'renderItemMaterials' | 'renderFeedbackContent' | 'renderFeedbackPreview'>

/** Keep the shared editor and its media adapters outside the basic metadata entry. */
export default function ScaleEditDefinition(props: Props) {
  return <ScaleDefinitionEditor {...props}
    renderItemMaterials={(item, change) => <TrainingMaterialPicker label="题目展示素材" value={item.materials} disabled={props.controlsDisabled} onChange={materials => change({ materials })} />}
    renderFeedbackContent={(content, change) => <TrainingMaterialPicker label="反馈展示素材" value={content.materials} disabled={props.controlsDisabled} onChange={materials => change({ ...content, materials })} />}
    renderFeedbackPreview={content => content.materials?.map(item => <TrainingMaterialPreview key={item.asset.assetId} item={item} />)}
  />
}
