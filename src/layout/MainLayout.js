import Sidebar from '../components/Sidebar';

function MainLayout({ children }) {
  return (
    <div className="app-root">
      <div className="app-shell">
        <Sidebar />
        <main className="app-main">{children}</main>
      </div>
    </div>
  );
}

export default MainLayout;
