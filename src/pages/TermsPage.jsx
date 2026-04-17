import { Link } from 'react-router-dom';

function TermsPage() {
  return (
    <div className="compliance-page-route">
      <div className="compliance-page">
        <div className="compliance-shell compliance-shell-narrow">
          <header className="compliance-hero">
            <div className="compliance-eyebrow">Kaylad LLC</div>
            <h1 className="compliance-title">Terms & Conditions</h1>
            <p className="compliance-copy">
              These Terms & Conditions apply to SMS communications sent by Kaylad LLC for customer
              care and service-related conversations.
            </p>
          </header>

          <section className="compliance-card compliance-article">
            <h2>SMS consent terms</h2>
            <p>
              By providing your phone number and opting in, you agree to receive SMS messages from
              Kaylad LLC.
            </p>
            <p>
              Messages may include customer support replies, appointment reminders, account-related
              follow-ups, and service notifications.
            </p>
            <p>
              Message frequency varies based on your requests, account activity, and ongoing service
              needs. Message and data rates may apply.
            </p>
            <p>
              You may reply STOP at any time to opt out of future SMS communications. You may reply
              HELP for assistance.
            </p>
            <p>
              Additional information about how phone numbers are handled is available in our{' '}
              <Link to="/privacy">Privacy Policy</Link>.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}

export default TermsPage;
