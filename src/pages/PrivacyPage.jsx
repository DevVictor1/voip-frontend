import { Link } from 'react-router-dom';

function PrivacyPage() {
  return (
    <div className="compliance-page-route">
      <div className="compliance-page">
        <div className="compliance-shell compliance-shell-narrow">
          <header className="compliance-hero">
            <div className="compliance-eyebrow">Kaylad LLC</div>
            <h1 className="compliance-title">Privacy Policy</h1>
            <p className="compliance-copy">
              This Privacy Policy explains how Kaylad LLC collects and uses phone numbers and related
              contact information when communicating with customers by SMS for customer care and
              service-related conversations.
            </p>
          </header>

          <section className="compliance-card compliance-article">
            <h2>Use of mobile information</h2>
            <p>
              Kaylad LLC may collect and use mobile phone numbers to send SMS related to account
              notifications, appointments, service updates, and customer support.
            </p>
            <p>
              Message frequency varies based on your interactions with Kaylad LLC. Message and data
              rates may apply according to your wireless plan.
            </p>
            <p>
              You can reply STOP to opt out of future SMS messages at any time. You can reply HELP
              for assistance.
            </p>
            <p>
              Kaylad LLC does not share, sell, rent, or disclose mobile phone numbers or SMS consent
              data to third parties for marketing or promotional purposes.
            </p>
            <p>
              These SMS communications are intended for customer care and conversational use cases,
              not unsolicited marketing.
            </p>
            <p>
              For additional information about the SMS program terms, please review our{' '}
              <Link to="/terms">Terms & Conditions</Link>.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}

export default PrivacyPage;
