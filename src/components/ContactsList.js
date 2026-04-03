import ImportContacts from "./ImportContacts";
import BASE_URL from "../config/api";

const normalize = (num) => num?.replace(/\D/g, '').slice(-10);

function ContactsList({ list, activeId, onSelect }) {

  const handleDelete = async (id, e) => {
    e.stopPropagation();

    if (!window.confirm("Delete this contact?")) return;

    await fetch(`${BASE_URL}/api/contacts/${id}`, {
      method: "DELETE",
    });

    window.location.reload();
  };

  return (
    <div className="contacts-wrapper">

      <div className="contacts-header">
        <h3>Contacts</h3>
        <span>{list.length} total</span>
      </div>

      <div className="contacts-import">
        <ImportContacts onImportSuccess={() => window.location.reload()} />
      </div>

      <div className="contacts-scroll">

        {list.map((item, index) => {
          const phones = item.phones || [];

          return (
            <div
  key={index}
  className="contact-card"
  style={{ position: 'relative' }}
  onClick={() => {
    if (item.phone) onSelect(item.phone);
  }}
>

  {/* ✅ FIXED DELETE BUTTON */}
  {item._id && (
    <button
      onClick={(e) => handleDelete(item._id, e)}
      style={{
        position: 'absolute',
        top: '8px',
        right: '8px',
        background: '#222',
        border: 'none',
        color: '#aaa',
        borderRadius: '4px',
        cursor: 'pointer',
        padding: '2px 6px'
      }}
    >
      ✕
    </button>
  )}

              <div className="contact-name">
                {item.firstName
                  ? `${item.firstName} ${item.lastName || ""}`
                  : item.name}
              </div>

              {/* 🔥 MULTI NUMBER */}
              <div className="contact-phones" style={{ marginTop: '6px' }}>
                {phones.map((p, i) => (
                  <div
                    key={i}
                    onClick={(e) => {
                      e.stopPropagation(); // 🔥 prevent overriding card click
                      onSelect(p.number);
                    }}
                    className={`phone-item ${
                      normalize(activeId) === normalize(p.number) ? 'active' : ''
                    }`}
                  >
                    {p.label} • {p.number}
                  </div>
                ))}
              </div>

              {/* 🔥 UNREAD DOT (clean, not bulky) */}
              {item.unread > 0 && (
                <div style={{
                  position: 'absolute',
                  right: '10px',
                  top: '10px',
                  width: '8px',
                  height: '8px',
                  background: '#1d9bf0',
                  borderRadius: '50%'
                }} />
              )}

              {item.lastMessage && (
                <div className="contact-last">{item.lastMessage}</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default ContactsList;