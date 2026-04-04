import { useState } from 'react';

function NewMessageModal({ isOpen, onClose, onStart }) {
  const [phone, setPhone] = useState('');

  if (!isOpen) return null;

  const handleStart = () => {
    if (!phone.trim()) return;

    onStart(phone.trim());
    setPhone('');
    onClose();
  };

  return (
    <div style={overlayStyle}>
      <div style={modalStyle}>
        <h3>New Message</h3>

        <input
          type="text"
          placeholder="Enter phone number e.g. +123..."
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          style={inputStyle}
        />

        <div style={{ marginTop: '10px', display: 'flex', gap: '10px' }}>
          <button onClick={handleStart} style={btnPrimary}>
            Start Chat
          </button>

          <button onClick={onClose} style={btnSecondary}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

export default NewMessageModal;

/* ðŸ”¥ STYLES */
const overlayStyle = {
  position: 'fixed',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  background: 'rgba(0,0,0,0.4)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 999,
};

const modalStyle = {
  background: '#fff',
  padding: '20px',
  borderRadius: '8px',
  width: '300px',
};

const inputStyle = {
  width: '100%',
  padding: '8px',
  marginTop: '10px',
};

const btnPrimary = {
  background: '#1d9bf0',
  color: '#fff',
  border: 'none',
  padding: '6px 12px',
  borderRadius: '6px',
  cursor: 'pointer',
};

const btnSecondary = {
  background: '#ccc',
  border: 'none',
  padding: '6px 12px',
  borderRadius: '6px',
  cursor: 'pointer',
};
