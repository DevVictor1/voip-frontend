import ImportContacts from "./ImportContacts";
import { X } from "lucide-react";
import BASE_URL from "../config/api";

const normalize = (num) => num?.replace(/\D/g, '').slice(-10);

function ContactsList({ list, activeId, onSelect }) {
  const getDisplayName = (item) => {
    const fullName = [item.firstName, item.lastName].filter(Boolean).join(' ').trim();
    return fullName || item.name || item.phone;
  };

  const getActivePhone = (item) => {
    const phones = item.phones || [];
    return (
      phones.find((p) => normalize(p.number) === normalize(activeId))?.number ||
      phones[0]?.number ||
      item.phone ||
      ''
    );
  };

  const getSecondaryLine = (item, phone) => {
    return [phone, item.dba].filter(Boolean).join(' / ');
  };

  const handleDelete = async (id, e) => {
    e.stopPropagation();

    if (!window.confirm("Delete this contact?")) return;

    await fetch(`${BASE_URL}/api/contacts/${id}`, {
      method: "DELETE",
    });

    window.location.reload(); // ✅ keep this (delete should refresh)
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
          const activePhone = getActivePhone(item);
          const isActive = phones.length
            ? phones.some((p) => normalize(activeId) === normalize(p.number))
            : normalize(activeId) === normalize(item.phone);

          const hasUnread = item.unread > 0;
          const displayName = getDisplayName(item);
          const secondaryLine = getSecondaryLine(item, activePhone);

          return (
            <div
              key={index}
              className={`contact-card${isActive ? ' is-active' : ''}${hasUnread ? ' has-unread' : ''}`}
              onClick={() => {
                if (item.phone) onSelect(item.phone); // ✅ ONLY SELECT
              }}
            >

              {/* DELETE */}
              {item._id && (
                <button
                  className="delete-btn"
                  onClick={(e) => handleDelete(item._id, e)}
                >
                  <X size={12} />
                </button>
              )}

              <div className="contact-card-body">
                <div className="contact-row contact-row-top">
                  <div className="contact-main">
                    <div className="contact-name">
                      {displayName}
                    </div>
                    {secondaryLine && (
                      <div className="contact-meta">
                        {secondaryLine}
                      </div>
                    )}
                  </div>
                  <div className="contact-indicators">
                    {hasUnread && (
                      <span className="unread-badge">{item.unread}</span>
                    )}
                    <span className={`assignment-badge${item.isUnassigned ? ' is-unassigned' : ''}`}>
                      {item.isUnassigned ? 'Unassigned' : 'Assigned'}
                    </span>
                  </div>
                </div>

                <div className={`contact-preview${hasUnread ? ' is-unread' : ''}`}>
                  {item.lastMessage || 'No messages yet'}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default ContactsList;
