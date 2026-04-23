import { useState } from 'react';
import BASE_URL from '../config/api';

function ImportContacts({ onImportSuccess, onImportError }) {
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleUpload = async () => {
    if (!file) {
      const message = 'Please select a CSV file';

      if (onImportError) {
        onImportError(message);
      } else {
        alert(message);
      }
      return;
    }

    const formData = new FormData();
    formData.append('file', file);

    try {
      setLoading(true);

      const res = await fetch(`${BASE_URL}/api/contacts/import`, {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data?.error || 'Failed to import contacts');
      }

      setFile(null);

      if (onImportSuccess) {
        onImportSuccess(data);
      } else {
        alert(`Imported ${data.count || 0} contacts`);
      }
    } catch (err) {
      console.error('Import error:', err);
      const message = err?.message || 'Failed to import contacts';

      if (onImportError) {
        onImportError(message);
      } else {
        alert(message);
      }
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
        type="button"
      >
        {loading ? 'Importing...' : 'Import Contacts'}
      </button>
    </div>
  );
}

export default ImportContacts;
