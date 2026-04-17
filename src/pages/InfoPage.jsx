import { Link } from 'react-router-dom';

function InfoPage() {
  return (
    <div className="compliance-page-route">
      <div className="compliance-page">
        <div className="compliance-shell">
          <header className="compliance-hero">
            <div className="compliance-eyebrow">Kaylad LLC</div>
            <h1 className="compliance-title">Customer communication and SMS consent information</h1>
            <p className="compliance-copy">
              Kaylad LLC provides customer communication and support services by phone and SMS. This
              page explains the consent language used when customers choose to receive text messages
              related to their accounts, appointments, service activity, and support interactions.
            </p>
            <div className="compliance-link-row">
              <Link className="compliance-link-pill" to="/privacy">Privacy Policy</Link>
              <Link className="compliance-link-pill" to="/terms">Terms & Conditions</Link>
            </div>
          </header>

          <section className="compliance-grid">
            <article className="compliance-card">
              <h2>How consent is collected</h2>
              <p>
                Customers provide a phone number during a service interaction and actively opt in to
                receive follow-up SMS communications from Kaylad LLC. Consent is tied to customer
                care communications and is not presented as a public marketing signup.
              </p>

              <div className="compliance-demo-form" aria-label="SMS consent example">
                <label className="compliance-field">
                  <span>Mobile phone number</span>
                  <input type="tel" placeholder="(555) 123-4567" readOnly />
                </label>

                <label className="compliance-checkbox">
                  <input type="checkbox" readOnly />
                  <span>
                    I agree to receive SMS from Kaylad LLC related to my account, appointments,
                    service updates, and customer support. Message frequency varies. Message and data
                    rates may apply. Reply STOP to opt out. Reply HELP for assistance. I have reviewed
                    the <Link to="/privacy"> Privacy Policy</Link> and <Link to="/terms"> Terms & Conditions</Link>.
                  </span>
                </label>

                <button type="button" className="compliance-primary-button">
                  Consent Example
                </button>
              </div>
            </article>

            <article className="compliance-card">
              <h2>Program details</h2>
              <ul className="compliance-list">
                <li>Brand: Kaylad LLC</li>
                <li>Program type: Customer care and conversational SMS</li>
                <li>Message topics: Account notifications, appointments, service updates, and support</li>
                <li>Message frequency varies based on customer activity and support needs</li>
                <li>Message and data rates may apply</li>
                <li>Reply STOP to opt out and HELP for assistance</li>
              </ul>
            </article>
          </section>
        </div>
      </div>
    </div>
  );
}

export default InfoPage;
