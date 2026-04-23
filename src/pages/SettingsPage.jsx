import NumbersPage from './NumbersPage';
import { UserAdminSettingsSection } from './Users';

function SettingsPage({ currentUserRole = 'admin', currentUserId = '' }) {
  return (
    <div className="settings-page" style={{ display: 'grid', gap: '24px' }}>
      <div>
        <h1 className="page-title">Settings</h1>
        <div className="page-subtitle settings-copy">
          Keep workspace administration here, including user provisioning, contact import access, and numbers management, while Directory stays focused on internal teammate lookup.
        </div>
      </div>

      <UserAdminSettingsSection currentUserRole={currentUserRole} currentUserId={currentUserId} />
      <NumbersPage embedded />
    </div>
  );
}

export default SettingsPage;
