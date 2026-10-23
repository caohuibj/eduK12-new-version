import TrainingPublicHeader from './TrainingPublicHeader'
import './training-portal-refresh.css'

/** Contact details will be supplied later; keep the page intentionally empty. */
export default function TrainingContactPage() {
  return <div className="training-portal training-contact-page">
    <TrainingPublicHeader />
    <section className="training-contact-content" aria-labelledby="training-contact-title">
      <h1 id="training-contact-title">联系我们</h1>
    </section>
  </div>
}
