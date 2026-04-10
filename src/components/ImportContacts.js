import { useState } from 'react';
import BASE_URL from '../config/api';

function ImportContacts({ onImportSuccess }) {
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleUpload = async () => {
    if (!file) return alert('Please select a CSV file');

    const formData = new FormData();
    formData.append('file', file);

    try {
      setLoading(true);

      const res = await fetch(`${BASE_URL}/api/contacts/import`, {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();

      alert(`âœ… Imported ${data.count} contacts`);

      setFile(null);

      // ðŸ”¥ REFRESH CONTACTS
      if (onImportSuccess) onImportSuccess();

    } catch (err) {
      console.error('âŒ Import error:', err);
      alert('Failed to import contacts');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="import-contacts">
      <input
        type="file"
        accept=".csv"
        className="import-contacts-input"
        onChange={(e) => setFile(e.target.files[0])}
      />

      <button
        onClick={handleUpload}
        disabled={loading}
        className="import-contacts-button"
      >
        {loading ? 'Importing...' : 'Import Contacts'}
      </button>
    </div>
  );
}

export default ImportContacts;
