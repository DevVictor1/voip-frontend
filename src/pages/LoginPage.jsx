import { useState } from 'react';

function LoginPage({ onLogin, isSubmitting = false, error = '' }) {
  const [form, setForm] = useState({
    email: '',
    password: '',
  });

  const handleChange = (field) => (event) => {
    setForm((prev) => ({
      ...prev,
      [field]: event.target.value,
    }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    await onLogin?.(form);
  };

  return (
    <div style={pageStyle}>
      <div style={panelStyle}>
        <div style={brandStyle}>KAYLAD</div>
        <h1 style={titleStyle}>Sign in</h1>
        <p style={copyStyle}>
          Use your workspace credentials to access voice, messaging, and team communication.
        </p>

        <form onSubmit={handleSubmit} style={formStyle}>
          <label style={fieldStyle}>
            <span style={labelStyle}>Email</span>
            <input
              type="email"
              value={form.email}
              onChange={handleChange('email')}
              placeholder="you@company.com"
              autoComplete="email"
              required
              style={inputStyle}
            />
          </label>

          <label style={fieldStyle}>
            <span style={labelStyle}>Password</span>
            <input
              type="password"
              value={form.password}
              onChange={handleChange('password')}
              placeholder="Enter your password"
              autoComplete="current-password"
              required
              style={inputStyle}
            />
          </label>

          {error ? <div style={errorStyle}>{error}</div> : null}

          <button type="submit" disabled={isSubmitting} style={buttonStyle}>
            {isSubmitting ? 'Signing in...' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  );
}

const pageStyle = {
  minHeight: '100vh',
  display: 'grid',
  placeItems: 'center',
  padding: '24px',
  background: 'linear-gradient(135deg, #eef4ff 0%, #f8fafc 55%, #eef6f0 100%)',
};

const panelStyle = {
  width: '100%',
  maxWidth: '420px',
  background: 'rgba(255, 255, 255, 0.96)',
  border: '1px solid rgba(15, 23, 42, 0.08)',
  borderRadius: '24px',
  boxShadow: '0 24px 80px rgba(15, 23, 42, 0.14)',
  padding: '32px',
};

const brandStyle = {
  fontSize: '12px',
  fontWeight: 700,
  letterSpacing: '0.24em',
  color: '#0f172a',
  marginBottom: '16px',
};

const titleStyle = {
  margin: '0 0 8px',
  fontSize: '30px',
  color: '#0f172a',
};

const copyStyle = {
  margin: '0 0 24px',
  fontSize: '14px',
  lineHeight: 1.6,
  color: '#475569',
};

const formStyle = {
  display: 'grid',
  gap: '16px',
};

const fieldStyle = {
  display: 'grid',
  gap: '8px',
};

const labelStyle = {
  fontSize: '13px',
  fontWeight: 600,
  color: '#334155',
};

const inputStyle = {
  width: '100%',
  borderRadius: '14px',
  border: '1px solid #cbd5e1',
  padding: '12px 14px',
  fontSize: '14px',
  outline: 'none',
  boxSizing: 'border-box',
};

const errorStyle = {
  borderRadius: '12px',
  padding: '10px 12px',
  background: '#fff1f2',
  color: '#be123c',
  fontSize: '13px',
};

const buttonStyle = {
  border: 'none',
  borderRadius: '14px',
  padding: '13px 16px',
  background: '#0f172a',
  color: '#ffffff',
  fontSize: '14px',
  fontWeight: 700,
  cursor: 'pointer',
};

export default LoginPage;
