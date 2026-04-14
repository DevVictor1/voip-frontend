import Sidebar from '../components/Sidebar';

function MainLayout({ children, userRole, onRoleChange }) {
  return (
    <div className="app-root">
      <div className="app-shell">
        <Sidebar userRole={userRole} onRoleChange={onRoleChange} />
        <main className="app-main">{children}</main>
      </div>
    </div>
  );
}

export default MainLayout;

