import trainingLogo from './training-logo.svg'
import './training-brand.css'

/** Complete vector identity, with outlined lettering and no runtime font dependency. */
export default function TrainingBrand({ className = '' }: { className?: string }) {
  return <span className={`training-wordmark training-wordmark--mountain ${className}`}>
    <img className="training-brand-lockup" src={trainingLogo} width="1448" height="396" alt="Training @eduk12.top" />
  </span>
}
