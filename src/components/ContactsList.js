import ImportContacts from "./ImportContacts";
import { X } from "lucide-react";
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

  const autoAssign = async (item) => {
    if (!item._id || !item.isUnassigned) return;

    await fetch(`${BASE_URL}/api/contacts/${item._id}/assign`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: "user_1" })
    });
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
          const isActive =
            normalize(activeId) === normalize(item.phone);

          const hasUnread = item.unread > 0;

          return (
            <div
              key={index}
              className="contact-card"
              style={{
                position: 'relative',
                background: hasUnread ? '#1a1f2b' : undefined,
                borderLeft: hasUnread ? '3px solid #1d9bf0' : '3px solid transparent',
                fontWeight: hasUnread ? 'bold' : 'normal'
              }}
              onClick={async () => {
                if (item.isUnassigned) {
                  await autoAssign(item);
                  window.location.reload();
                }

                if (item.phone) onSelect(item.phone);
              }}
            >

              {/* DELETE */}
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
                  <X size={12} />
                </button>
              )}

              {/* STATUS */}
              {!item.isUnassigned && (
                <div style={{
                  position: 'absolute',
                  bottom: '8px',
                  right: '8px',
                  background: '#333',
                  color: '#fff',
                  borderRadius: '4px',
                  padding: '3px 6px',
                  fontSize: '10px'
                }}>
                  Assigned
                </div>
              )}

              {item.isUnassigned && (
                <div style={{
                  position: 'absolute',
                  bottom: '8px',
                  right: '8px',
                  background: '#1d9bf0',
                  color: '#fff',
                  borderRadius: '4px',
                  padding: '3px 6px',
                  fontSize: '10px'
                }}>
                  Unassigned
                </div>
              )}

              <div className="contact-name">
                {item.firstName
                  ? `${item.firstName} ${item.lastName || ""}`
                  : item.name}
              </div>

              <div className="contact-phones" style={{ marginTop: '6px' }}>
                {phones.map((p, i) => (
                  <div
                    key={i}
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelect(p.number);
                    }}
                    className={`phone-item ${
                      normalize(activeId) === normalize(p.number) ? 'active' : ''
                    }`}
                  >
                    {p.label} - {p.number}
                  </div>
                ))}
              </div>

              {/* 🔥 UNREAD COUNT BADGE */}
              {hasUnread && (
                <div style={{
                  position: 'absolute',
                  right: '10px',
                  top: '10px',
                  minWidth: '18px',
                  height: '18px',
                  background: '#1d9bf0',
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '11px',
                  fontWeight: 'bold',
                  color: '#fff',
                  padding: '0 5px'
                }}>
                  {item.unread}
                </div>
              )}

              {item.lastMessage && (
                <div
                  className="contact-last"
                  style={{
                    opacity: hasUnread ? 1 : 0.7,
                    fontWeight: hasUnread ? 'bold' : 'normal'
                  }}
                >
                  {item.lastMessage}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default ContactsList;