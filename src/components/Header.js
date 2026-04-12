import { useState } from "react";
import { Phone } from "lucide-react";

const normalize = (num) => num?.replace(/\D/g, '').slice(-10);

function Header({
  title,
  subtitle,
  status,
  chat,
  onSwitchNumber,
  onCall,
  callLabel
}) {
  const [showDropdown, setShowDropdown] = useState(false);

  const phones = chat?.phones || [];
  const activeNumber = chat?.phone;

  const activeLabel =
    phones.find(p => normalize(p.number) === normalize(activeNumber))?.label || 'PHONE';

  return (
    <div className="header">

      <div className="header-title">
        <div>
          <h3>{title}</h3>
          {subtitle && <div className="header-meta">{subtitle}</div>}

          {phones.length > 1 && (
            <>
              <button
                onClick={() => setShowDropdown(prev => !prev)}
                style={{
                  marginTop: '6px',
                  background: '#111',
                  color: '#fff',
                  padding: '4px 10px',
                  borderRadius: '6px',
                  fontSize: '12px',
                  cursor: 'pointer',
                  border: '1px solid #333'
                }}
              >
                {activeLabel.toUpperCase()} ▼
              </button>

              {showDropdown && (
                <div
                  style={{
                    position: 'fixed', // 🔥 THIS IS THE REAL FIX
                    top: '120px',      // adjust if needed
                    left: '350px',     // adjust if needed
                    background: '#fff',
                    borderRadius: '8px',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                    zIndex: 9999999,
                    minWidth: '200px'
                  }}
                >
                  {phones.map((p, i) => {
                    const isActive =
                      normalize(p.number) === normalize(activeNumber);

                    return (
                      <div
                        key={i}
                        onClick={() => {
                          onSwitchNumber(p.number);
                          setShowDropdown(false);
                        }}
                        style={{
                          padding: '10px',
                          cursor: 'pointer',
                          background: isActive ? '#f0f4ff' : '#fff',
                          color: '#000',
                          borderBottom: '1px solid #eee'
                        }}
                      >
                        <div style={{ fontWeight: 'bold', fontSize: '12px' }}>
                          {p.label.toUpperCase()}
                        </div>
                        <div style={{ fontSize: '13px' }}>
                          {p.number}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>

        {status && <span className="status-pill">{status}</span>}
      </div>

      <div className="header-actions">
        <button className="button-icon">Assign</button>
        <button className="button-icon">Notes</button>
        <button className="button-icon">Options</button>

        <button
          onClick={onCall}
          style={{
            background: '#1d9bf0',
            color: '#fff',
            border: 'none',
            padding: '6px 12px',
            borderRadius: '6px',
            marginLeft: '8px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '6px'
          }}
        >
          <Phone size={16} />
          {callLabel || 'Call'}
        </button>
      </div>
    </div>
  );
}

export default Header;