import ImportContacts from "./ImportContacts";
import BASE_URL from "../config/api";

function ContactsList({ list, activeId, onSelect }) {

  // 🗑 DELETE CONTACT
  const handleDelete = async (id, e) => {
    e.stopPropagation(); // ❌ prevent opening chat

    const confirmDelete = window.confirm("Delete this contact?");
    if (!confirmDelete) return;

    try {
      await fetch(`${BASE_URL}/api/contacts/${id}`, {
        method: "DELETE",
      });

      // 🔥 quick refresh (safe for now)
      window.location.reload();
    } catch (err) {
      console.error("❌ Delete error:", err);
      alert("Failed to delete contact");
    }
  };

  return (
    <div
      className="panel contacts-list"
      style={{
        display: 'flex',
        flexDirection: 'column',
        flex: 1,
        minHeight: 0,
      }}
    >

      {/* HEADER */}
      <div className="contacts-list-header">
        <h3 className="contacts-list-title">Contacts</h3>
        <div className="contacts-list-subtitle">
          {list.length} total
        </div>
      </div>

      {/* IMPORT */}
      <div className="contacts-list-import">
        <ImportContacts onImportSuccess={() => window.location.reload()} />
      </div>

      {/* EMPTY STATE */}
      {list.length === 0 && (
        <p className="contacts-list-empty">
          No contacts or conversations
        </p>
      )}

      {/* LIST */}
      <div
        className="contacts-list-items"
        style={{
          flex: 1,
          overflowY: 'auto',
          minHeight: 0,
        }}
      >
        {list.map((item, index) => (
          <div
            key={index}
            className={`contact-card ${
              activeId === item.phone ? "is-active" : ""
            }`}
            onClick={() => onSelect(item.phone)}
            style={{ position: "relative" }} // 🔥 needed for delete btn
          >

            {/* 🗑 DELETE BUTTON (ONLY FOR CONTACTS) */}
            {item._id && (
              <button
                className="delete-btn"
                onClick={(e) => handleDelete(item._id, e)}
              >
                ✕
              </button>
            )}

            {/* NAME */}
            <div className="contact-card-name">
              {item.firstName
                ? `${item.firstName} ${item.lastName || ""}`
                : item.name || item.phone}
            </div>

            {/* PHONE */}
            <div className="contact-card-meta">
              {item.phone}
            </div>

            {/* DBA */}
            {item.dba && (
              <div className="contact-card-meta contact-card-muted">
                {item.dba}
              </div>
            )}

            {/* LAST MESSAGE */}
            <div className="contact-card-meta contact-card-muted">
              {item.lastMessage || "No messages yet"}
            </div>

            {/* UNREAD */}
            {item.unread > 0 && (
              <div className="contact-badge">
                {item.unread}
              </div>
            )}

          </div>
        ))}
      </div>
    </div>
  );
}

export default ContactsList;