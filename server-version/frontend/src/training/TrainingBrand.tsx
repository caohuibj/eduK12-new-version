import trainingLogo from './training-logo.svg'
import trainingLogoDark from './training-logo-dark.svg'
import { useTrainingAppearance } from './appearanceContext'
import './training-brand.css'

/** Complete vector identity, with outlined lettering and no runtime font dependency. */
export default function TrainingBrand({ className = '' }: { className?: string }) {
  const { theme } = useTrainingAppearance()
  return <span className={`training-wordmark training-wordmark--mountain ${className}`}>
    <img className="training-brand-lockup" src={theme === 'dark' ? trainingLogoDark : trainingLogo} width="1448" height="396" alt="Training @EduK12.top" />
  </span>
}
