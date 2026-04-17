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
              messaging program is used for customer care and conversational messages only, including
              account notifications, appointments, service updates, and customer support. Kaylad LLC
              does not use this program to send unsolicited marketing or promotional messages.
            </p>
            <section className="compliance-banner">
              <div className="compliance-banner-title">Public reviewer summary</div>
              <div className="compliance-banner-copy">
                Sender: Kaylad LLC. Use case: Customer Care / Conversational. Consent is required
                before sending SMS unless the customer initiates the conversation first.
              </div>
            </section>
            <div className="compliance-link-row compliance-link-row-prominent">
              <Link className="compliance-link-pill" to="/privacy">View Privacy Policy</Link>
              <Link className="compliance-link-pill" to="/terms">View Terms & Conditions</Link>
            </div>
          </header>

          <section className="compliance-grid">
            <article className="compliance-card">
              <h2>Brand and program summary</h2>
              <p>
                Kaylad LLC communicates with customers by phone and SMS to support service-related
                conversations. These messages are intended for customer care and conversational use
                cases only.
              </p>
              <p>
                Messages may include customer support responses, appointment confirmations or
                reminders, service updates, and account notifications. No unsolicited marketing or
                promotional SMS messages are sent through this program.
              </p>
            </article>

            <article className="compliance-card">
              <h2>SMS Opt-In Process</h2>
              <ol className="compliance-steps">
                <li>A customer visits the public info page or a Kaylad LLC service or contact form.</li>
                <li>The customer provides a mobile phone number.</li>
                <li>The customer must actively check a consent checkbox before submitting.</li>
                <li>
                  The checkbox states that the customer agrees to receive SMS messages from Kaylad LLC
                  related to account notifications, appointments, service updates, and customer support.
                </li>
                <li>The customer submits the form.</li>
                <li>
                  No SMS messages are sent unless the customer has provided consent or initiated the
                  conversation first.
                </li>
              </ol>
            </article>
          </section>

          <section className="compliance-grid compliance-grid-balanced">
            <article className="compliance-card">
              <h2>SMS Opt-In Example</h2>
              <p>
                The example below shows the type of public customer consent language used to verify
                SMS opt-in for Kaylad LLC.
              </p>

              <div className="compliance-demo-form" aria-label="SMS consent example">
                <label className="compliance-field">
                  <span>Mobile phone number</span>
                  <input type="tel" placeholder="(555) 123-4567" readOnly />
                </label>

                <label className="compliance-checkbox">
                  <input type="checkbox" readOnly />
                  <span>
                    By providing your phone number and checking this box, you agree to receive SMS
                    messages from Kaylad LLC related to your account, appointments, service updates,
                    and customer support. Message frequency varies. Message and data rates may apply.
                    Reply STOP to opt out or HELP for assistance. Consent is not a condition of
                    purchase. I agree to the <Link to="/privacy"> Privacy Policy</Link> and
                    <Link to="/terms"> Terms & Conditions</Link>.
                  </span>
                </label>

                <button type="button" className="compliance-primary-button">
                  Submit Consent Example
                </button>
              </div>
            </article>

            <article className="compliance-card">
              <h2>Program details</h2>
              <ul className="compliance-list">
                <li>Brand: Kaylad LLC</li>
                <li>Use case: Customer Care / Conversational</li>
                <li>Message types: Customer support responses</li>
                <li>Message types: Appointment confirmations and reminders</li>
                <li>Message types: Service updates</li>
                <li>Message types: Account notifications</li>
                <li>Message frequency varies based on customer activity and support needs</li>
                <li>Message and data rates may apply</li>
                <li>Reply STOP to opt out and HELP for assistance</li>
                <li>No unsolicited marketing or promotional messages are sent</li>
              </ul>
              <div className="compliance-inline-links">
                <Link className="compliance-link-pill" to="/privacy">Privacy Policy</Link>
                <Link className="compliance-link-pill" to="/terms">Terms & Conditions</Link>
              </div>
            </article>
          </section>
        </div>
      </div>
    </div>
  );
}

export default InfoPage;
