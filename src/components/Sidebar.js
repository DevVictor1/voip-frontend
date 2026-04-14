import { NavLink } from 'react-router-dom';
import { LayoutDashboard, MessageSquare, Phone, Users, PhoneForwarded } from 'lucide-react';

const navItems = [
  { label: 'Dashboard', to: '/', icon: LayoutDashboard, roles: ['admin'] },
  { label: 'Messages', to: '/messages', icon: MessageSquare, roles: ['admin', 'agent'] },
  { label: 'Calls', to: '/calls', icon: Phone, roles: ['admin', 'agent'] },
  { label: 'Numbers', to: '/numbers', icon: PhoneForwarded, roles: ['admin'] },
  { label: 'Users', to: '/users', icon: Users, roles: ['admin'] }
];

function Sidebar({ userRole = 'admin', onRoleChange }) {
  const visibleItems = navItems.filter((item) => item.roles.includes(userRole));
  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-mark">V</div>
        <div className="brand-copy">
          <div className="brand-name">KAYLAD</div>
          <div className="brand-subtitle">Premium VoIP Suite</div>
        </div>
      </div>

      <div style={roleWrap}>
        <div style={roleLabel}>Role: {userRole === 'agent' ? 'Agent' : 'Admin'}</div>
        <select
          value={userRole}
          onChange={(e) => onRoleChange?.(e.target.value)}
          style={roleSelect}
        >
          <option value="admin">Admin</option>
          <option value="agent">Agent</option>
        </select>
      </div>

      <nav className="sidebar-nav">
        {visibleItems.map((item) => (
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
        <span>Enterprise plan • 42 seats</span> {/* ✅ FIXED */}
      </div>
    </aside>
  );
}

const roleWrap = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: '8px',
  padding: '10px 12px',
  borderRadius: '12px',
  border: '1px solid rgba(255, 255, 255, 0.12)',
  background: 'rgba(255, 255, 255, 0.06)',
  color: '#e2e8f0',
  fontSize: '12px'
};

const roleLabel = {
  fontWeight: 600
};

const roleSelect = {
  border: '1px solid rgba(255, 255, 255, 0.18)',
  background: 'transparent',
  color: '#e2e8f0',
  borderRadius: '8px',
  padding: '4px 6px',
  fontSize: '12px',
  cursor: 'pointer',
  outline: 'none'
};

export default Sidebar;
