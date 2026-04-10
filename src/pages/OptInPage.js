function OptInPage() {
  return (
    <div style={{ maxWidth: "500px", margin: "50px auto", fontFamily: "Arial" }}>
      <h2>SMS Consent</h2>

      <p>Please enter your phone number to receive updates and support messages.</p>

      <input
        type="tel"
        placeholder="Enter your phone number"
        style={{ width: "100%", padding: "10px", marginBottom: "15px" }}
      />

      <div style={{ marginBottom: "15px" }}>
        <input type="checkbox" id="consent" />
        <label htmlFor="consent" style={{ marginLeft: "8px", display: "inline-block" }}>
          By entering your phone number and checking this box, you consent to receive SMS messages from <strong>Kaylad LLC</strong> related to your account, appointments, service updates, and customer support. Message frequency varies based on your interactions. Message & data rates may apply. Reply <strong>STOP</strong> to opt out or <strong>HELP</strong> for assistance. You agree to our Privacy Policy and Terms & Conditions.
        </label>
      </div>

      <button style={{ padding: "10px 20px", cursor: "pointer" }}>
        Submit
      </button>

      <p style={{ marginTop: "20px", fontSize: "12px" }}>
        <a href="https://devvictor1.github.io/KayladLegal/privacy.html" target="_blank" rel="noopener noreferrer">
          Privacy Policy
        </a>{" "}
        |{" "}
        <a href="https://devvictor1.github.io/KayladLegal/terms.html" target="_blank" rel="noopener noreferrer">
          Terms & Conditions
        </a>
      </p>
    </div>
  );
}

export default OptInPage;