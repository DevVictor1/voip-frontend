import { NavLink } from 'react-router-dom';
import { LayoutDashboard, MessageSquare, Phone, Users } from 'lucide-react';

const navItems = [
  { label: 'Dashboard', to: '/', icon: LayoutDashboard },
  { label: 'Messages', to: '/messages', icon: MessageSquare },
  { label: 'Calls', to: '/calls', icon: Phone },
  { label: 'Users', to: '/users', icon: Users }
];

function Sidebar() {
  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-mark">V</div>
        <div className="brand-copy">
          <div className="brand-name">KAYLAD</div>
          <div className="brand-subtitle">Premium VoIP Suite</div>
        </div>
      </div>

      <nav className="sidebar-nav">
        {navItems.map((item) => (
          <NavLink
            key={item.label}
            to={item.to}
            className={({ isActive }) =>
              isActive ? 'nav-item active' : 'nav-item'
            }
            end={item.to === '/'}
          >
            <span className="nav-icon" aria-hidden="true">
              <item.icon size={18} />
            </span>
            <span>{item.label}</span>
          </NavLink>
        ))}
      </nav>

      <div className="sidebar-footer">
        <span>Workspace</span>
        <strong>New York, NY</strong>
        <span>Enterprise plan • 42 seats</span>
      </div>
    </aside>
  );
}

export default Sidebar;
