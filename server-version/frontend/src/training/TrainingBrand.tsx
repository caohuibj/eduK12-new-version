import bookMountainSymbol from './training-book-mountain.webp'
import './training-brand.css'

/** Shared training identity: an open book, mountains, and H as the learning path. */
export default function TrainingBrand({ className = '' }: { className?: string }) {
  return <span className={`training-wordmark training-wordmark--mountain ${className}`}>
    <img className="training-brand-icon training-home-brand-symbol" src={bookMountainSymbol} width="220" height="110" alt="" aria-hidden="true" />
    <span className="training-brand-type training-home-brand-type">Huitraining</span>
  </span>
}
