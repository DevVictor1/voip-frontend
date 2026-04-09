function OptInPage() {
  return (
    <div style={{ maxWidth: "500px", margin: "50px auto", fontFamily: "Arial" }}>
      <h2>SMS Consent</h2>

      <p>Please enter your phone number to receive updates.</p>

      <input
        type="tel"
        placeholder="Enter your phone number"
        style={{ width: "100%", padding: "10px", marginBottom: "10px" }}
      />

      <div style={{ marginBottom: "15px" }}>
        <input type="checkbox" id="consent" />
        <label htmlFor="consent" style={{ marginLeft: "8px" }}>
          By providing your phone number, you agree to receive SMS messages from Kaylad LLC related to your account, appointments, and customer support. Message frequency varies. Message & data rates may apply. Reply STOP to opt out. Reply HELP for assistance.
        </label>
      </div>

      <button style={{ padding: "10px 20px" }}>Submit</button>

      <p style={{ marginTop: "20px", fontSize: "12px" }}>
        <a href="https://devvictor1.github.io/KayladLegal/privacy.html">Privacy Policy</a> |{" "}
        <a href="https://devvictor1.github.io/KayladLegal/terms.html">Terms of Service</a>
      </p>
    </div>
  );
}

export default OptInPage;