import sheet01 from '../../../../assets/emotion-faces-ai-zh-v1.0.0/sheet-01.png'
import sheet02 from '../../../../assets/emotion-faces-ai-zh-v1.0.0/sheet-02.png'
import sheet03 from '../../../../assets/emotion-faces-ai-zh-v1.0.0/sheet-03.png'
import sheet04 from '../../../../assets/emotion-faces-ai-zh-v1.0.0/sheet-04.png'
import sheet05 from '../../../../assets/emotion-faces-ai-zh-v1.0.0/sheet-05.png'
import sheet01Webp from '../../../../assets/emotion-faces-ai-zh-v1.0.0/sheet-01.webp'
import sheet02Webp from '../../../../assets/emotion-faces-ai-zh-v1.0.0/sheet-02.webp'
import sheet03Webp from '../../../../assets/emotion-faces-ai-zh-v1.0.0/sheet-03.webp'
import sheet04Webp from '../../../../assets/emotion-faces-ai-zh-v1.0.0/sheet-04.webp'
import sheet05Webp from '../../../../assets/emotion-faces-ai-zh-v1.0.0/sheet-05.webp'
import sheet01Avif from '../../../../assets/emotion-faces-ai-zh-v1.0.0/sheet-01.avif'
import sheet02Avif from '../../../../assets/emotion-faces-ai-zh-v1.0.0/sheet-02.avif'
import sheet03Avif from '../../../../assets/emotion-faces-ai-zh-v1.0.0/sheet-03.avif'
import sheet04Avif from '../../../../assets/emotion-faces-ai-zh-v1.0.0/sheet-04.avif'
import sheet05Avif from '../../../../assets/emotion-faces-ai-zh-v1.0.0/sheet-05.avif'

const sheets = [
  { png: sheet01, webp: sheet01Webp, avif: sheet01Avif },
  { png: sheet02, webp: sheet02Webp, avif: sheet02Avif },
  { png: sheet03, webp: sheet03Webp, avif: sheet03Avif },
  { png: sheet04, webp: sheet04Webp, avif: sheet04Avif },
  { png: sheet05, webp: sheet05Webp, avif: sheet05Avif },
]

export const emotionAssetFor = (stimulusId: string): {
  url: string
  backgroundImage: string
  backgroundPosition: string
  label: string
} => {
  const match = /^emotion-identity-(\d{2})-(happy|sad|angry|fear|disgust|surprise)$/.exec(stimulusId)
  const identitySet = match ? Number(match[1]) : 1
  const emotionIndex = match ? ['happy', 'sad', 'angry', 'fear', 'disgust', 'surprise'].indexOf(match[2]) : 0
  const sheetIndex = Math.min(4, Math.floor((identitySet - 1) / 4))
  const rowIndex = Math.max(0, (identitySet - 1) % 4)
  const sheet = sheets[sheetIndex]
  return {
    url: sheet.png,
    backgroundImage: `image-set(url("${sheet.avif}") type("image/avif"), url("${sheet.webp}") type("image/webp"), url("${sheet.png}") type("image/png"))`,
    backgroundPosition: `${emotionIndex * 20}% ${rowIndex * (100 / 3)}%`,
    label: `合成面孔刺激 ${identitySet}-${emotionIndex + 1}`,
  }
}
