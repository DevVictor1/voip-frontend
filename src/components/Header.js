import { useState, useEffect, useRef } from "react";
import { Phone } from "lucide-react";

const normalize = (num) => num?.replace(/\D/g, '').slice(-10);

function Header({
  title,
  subtitle,
  status,
  chat,
  onSwitchNumber,
  onBack,
  showBack,
  onCall,
  callLabel,
  onAssignContact
}) {
  const [showDropdown, setShowDropdown] = useState(false);
  const [assigning, setAssigning] = useState(false); // ✅ NEW
  const [assigned, setAssigned] = useState(!chat?.isUnassigned); // ✅ NEW
  const dropdownRef = useRef(null);

  const phones = chat?.phones || [];
  const activeNumber = chat?.phone;

  const activeLabel =
    phones.find(p => normalize(p.number) === normalize(activeNumber))?.label || 'PHONE';

  // ✅ CLOSE ON OUTSIDE CLICK
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setShowDropdown(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // ✅ KEEP ASSIGN STATE IN SYNC
  useEffect(() => {
    setAssigned(!chat?.isUnassigned);
  }, [chat]);

  // ✅ ASSIGN HANDLER
  const handleAssign = async () => {
    if (!chat?._id || assigning || assigned) return;

    try {
      setAssigning(true);

      onAssignContact(chat._id); // ✅ CALL PARENT HANDLER TO ASSIGN

      setAssigned(true); // ✅ update UI instantly

    } catch (err) {
      console.error("Assign failed", err);
      alert("Failed to assign");
    } finally {
      setAssigning(false);
    }
  };

  return (
    <div className="header">

      <div className="header-title">
        {showBack && (
          <button
            className="header-back"
            type="button"
            onClick={onBack}
          >
            Back
          </button>
        )}
        <div>
          <h3>{title}</h3>
          {subtitle && <div className="header-meta">{subtitle}</div>}

          {phones.length > 1 && (
            <div ref={dropdownRef} style={{ position: 'relative', marginTop: '6px', display: 'inline-block' }}>
              
              <button
                onClick={() => setShowDropdown(prev => !prev)}
                style={{
                  background: '#111',
                  color: '#fff',
                  padding: '4px 10px',
                  borderRadius: '6px',
                  fontSize: '12px',
                  cursor: 'pointer',
                  border: '1px solid #333',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                {activeLabel.toUpperCase()}
                <span
                  style={{
                    display: 'inline-block',
                    transition: 'transform 0.2s ease',
                    transform: showDropdown ? 'rotate(180deg)' : 'rotate(0deg)'
                  }}
                >
                  ▼
                </span>
              </button>

              {showDropdown && (
                <div
                  style={{
                    position: 'absolute',
                    top: '35px',
                    left: 0,
                    background: '#fff',
                    borderRadius: '8px',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                    zIndex: 9999,
                    minWidth: '200px',
                    overflow: 'hidden',
                    animation: 'fadeSlide 0.2s ease'
                  }}
                >
                  {phones.map((p, i) => {
                    const isActive =
                      normalize(p.number) === normalize(activeNumber);

                    return (
                      <div
                        key={i}
                        onClick={() => {
                          if (onSwitchNumber) {
                            onSwitchNumber(p.number);
                          }
                          setShowDropdown(false);
                        }}
                        style={{
                          padding: '10px',
                          cursor: 'pointer',
                          background: isActive ? '#f0f4ff' : '#fff',
                          color: '#000',
                          borderBottom: '1px solid #eee',
                          transition: 'background 0.2s'
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.background = '#f5f7ff'}
                        onMouseLeave={(e) =>
                          e.currentTarget.style.background = isActive ? '#f0f4ff' : '#fff'
                        }
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
            </div>
          )}
        </div>

        {status && <span className="status-pill">{status}</span>}
      </div>

      <div className="header-actions">
        {/* ✅ UPDATED ASSIGN BUTTON */}
        <button
          className="button-icon"
          onClick={handleAssign}
          disabled={assigned || assigning}
          style={{
            opacity: assigned ? 0.6 : 1,
            cursor: assigned ? 'not-allowed' : 'pointer'
          }}
        >
          {assigned ? "Assigned" : assigning ? "Assigning..." : "Assign"}
        </button>

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

      <style>
        {`
          @keyframes fadeSlide {
            from {
              opacity: 0;
              transform: translateY(-5px);
            }
            to {
              opacity: 1;
              transform: translateY(0);
            }
          }
        `}
      </style>
    </div>
  );
}

export default Header;
