import { NavLink, Outlet } from 'react-router-dom';
import './App.css';

const TABS = [
  { to: '/',          label: 'Cases',           end: true },
  { to: '/runs',      label: 'Automation Runs', end: false },
  { to: '/knowledge', label: 'Knowledge',       end: false },
  { to: '/report',    label: 'VOC Report',      end: false },
  { to: '/health',    label: 'Health',          end: false },
  { to: '/voc',       label: 'VOC Tool',        end: false },
  { to: '/metrics',   label: 'Ops Metrics',     end: false },
];

export default function App() {
  return (
    <div className="app">
      <header className="app-header">
        <div className="app-title">
          <span className="app-logo">⚙</span>
          <span>CS Ops Dashboard</span>
        </div>
        <nav className="app-nav">
          {TABS.map(t => (
            <NavLink
              key={t.to}
              to={t.to}
              end={t.end}
              className={({ isActive }) => `nav-tab${isActive ? ' active' : ''}`}
            >
              {t.label}
            </NavLink>
          ))}
        </nav>
      </header>
      <main className="app-main">
        <Outlet />
      </main>
    </div>
  );
}
