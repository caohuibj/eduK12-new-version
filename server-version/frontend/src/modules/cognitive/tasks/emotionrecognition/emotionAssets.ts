import sheet01 from '../../../../assets/emotion-faces-ai-zh-v1.0.0/sheet-01.png'
import sheet02 from '../../../../assets/emotion-faces-ai-zh-v1.0.0/sheet-02.png'
import sheet03 from '../../../../assets/emotion-faces-ai-zh-v1.0.0/sheet-03.png'
import sheet04 from '../../../../assets/emotion-faces-ai-zh-v1.0.0/sheet-04.png'
import sheet05 from '../../../../assets/emotion-faces-ai-zh-v1.0.0/sheet-05.png'

const sheets = [sheet01, sheet02, sheet03, sheet04, sheet05]

export const emotionAssetFor = (stimulusId: string): {
  url: string
  backgroundPosition: string
  label: string
} => {
  const match = /^emotion-identity-(\d{2})-(happy|sad|angry|fear|disgust|surprise)$/.exec(stimulusId)
  const identitySet = match ? Number(match[1]) : 1
  const emotionIndex = match ? ['happy', 'sad', 'angry', 'fear', 'disgust', 'surprise'].indexOf(match[2]) : 0
  const sheetIndex = Math.min(4, Math.floor((identitySet - 1) / 4))
  const rowIndex = Math.max(0, (identitySet - 1) % 4)
  return {
    url: sheets[sheetIndex],
    backgroundPosition: `${emotionIndex * 20}% ${rowIndex * (100 / 3)}%`,
    label: `合成面孔刺激 ${identitySet}-${emotionIndex + 1}`,
  }
}
