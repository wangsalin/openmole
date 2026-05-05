import {
  Activity,
  AppWindow,
  Boxes,
  BrainCircuit,
  Building2,
  CreditCard,
  Database,
  KeyRound,
  LayoutDashboard,
  LogOut,
  Menu,
  ScrollText,
  Search,
  Settings,
  Shield,
  Users,
} from 'lucide-react';
import { FormEvent, ReactNode, useMemo, useState } from 'react';
import { NavLink, Route, Routes, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ApiError, getDashboard, listResource, loadContexts, loadMenus, login, logout } from './api';
import { useAuth } from './AuthContext';
import { ContextOption } from './types';

const navItems = [
  { path: '/', label: 'Overview', icon: LayoutDashboard },
  { path: '/apps', label: 'Apps', icon: AppWindow, endpoint: '/admin/v1/apps' },
  { path: '/tenants', label: 'Tenants', icon: Building2, endpoint: '/admin/v1/tenants' },
  { path: '/users', label: 'Users', icon: Users, endpoint: '/admin/v1/users' },
  { path: '/billing', label: 'Billing', icon: CreditCard, endpoint: '/admin/v1/plans' },
  { path: '/ai', label: 'AI Center', icon: BrainCircuit, endpoint: '/admin/v1/ai/providers' },
  { path: '/knowledge', label: 'Knowledge', icon: Database, endpoint: '/admin/v1/knowledge-bases' },
  { path: '/developer', label: 'Developer', icon: KeyRound, endpoint: '/admin/v1/developer/api-keys' },
  { path: '/audit', label: 'Audit', icon: ScrollText, endpoint: '/admin/v1/audit-logs' },
  { path: '/system', label: 'System', icon: Settings, endpoint: '/admin/v1/system/settings' },
];

export function App() {
  const auth = useAuth();
  if (!auth.token) return <LoginView />;
  return <AdminShell />;
}

function LoginView() {
  const auth = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('admin@example.com');
  const [password, setPassword] = useState('ChangeMe123!');
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(undefined);
    setLoading(true);
    try {
      const session = await login(email, password);
      auth.signIn(session);
      navigate('/');
    } catch (err) {
      setError(err instanceof ApiError ? `${err.body?.code ?? err.status}: ${err.message}` : 'Login failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="login-screen">
      <section className="login-panel">
        <div className="brand-row">
          <span className="brand-mark">OM</span>
          <div>
            <h1>OpenMole</h1>
            <p>Admin Console</p>
          </div>
        </div>
        <form className="login-form" onSubmit={onSubmit}>
          <label>
            Email
            <input value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" />
          </label>
          <label>
            Password
            <input
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              type="password"
              autoComplete="current-password"
            />
          </label>
          {error ? <p className="form-error">{error}</p> : null}
          <button type="submit" className="primary-button" disabled={loading}>
            <Shield size={18} />
            {loading ? 'Signing in' : 'Sign in'}
          </button>
        </form>
      </section>
    </main>
  );
}

function AdminShell() {
  const auth = useAuth();
  const navigate = useNavigate();
  const contexts = useQuery({ queryKey: ['contexts'], queryFn: loadContexts });
  useQuery({ queryKey: ['menus'], queryFn: loadMenus });

  async function onLogout() {
    await logout().catch(() => undefined);
    auth.signOut();
    navigate('/');
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <span className="brand-mark">OM</span>
          <div>
            <strong>OpenMole</strong>
            <span>Control Plane</span>
          </div>
        </div>
        <nav className="nav-list">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink key={item.path} to={item.path} end={item.path === '/'}>
                <Icon size={18} />
                <span>{item.label}</span>
              </NavLink>
            );
          })}
        </nav>
      </aside>
      <div className="main-column">
        <header className="topbar">
          <button className="icon-button" title="Navigation">
            <Menu size={18} />
          </button>
          <div className="search-box">
            <Search size={17} />
            <input placeholder="Search records" />
          </div>
          <ContextSelect
            contexts={contexts.data ?? []}
            onChange={(context) => auth.setActiveContext(context)}
          />
          <div className="user-chip">
            <span>{auth.user?.displayName ?? auth.user?.email ?? 'Admin'}</span>
          </div>
          <button className="icon-button" onClick={onLogout} title="Logout">
            <LogOut size={18} />
          </button>
        </header>
        <main className="content">
          <Routes>
            <Route path="/" element={<Overview />} />
            {navItems
              .filter((item) => item.endpoint)
              .map((item) => (
                <Route
                  key={item.path}
                  path={item.path}
                  element={<ResourcePage title={item.label} endpoint={item.endpoint!} />}
                />
              ))}
          </Routes>
        </main>
      </div>
    </div>
  );
}

function ContextSelect({
  contexts,
  onChange,
}: {
  contexts: ContextOption[];
  onChange(context: { appId?: string; tenantId?: string | null }): void;
}) {
  return (
    <select
      className="context-select"
      onChange={(event) => {
        const context = contexts[Number(event.target.value)];
        onChange({
          appId: context?.membership.appId,
          tenantId: context?.membership.tenantId,
        });
      }}
    >
      {contexts.length ? (
        contexts.map((context, index) => (
          <option key={`${context.membership.appId}:${context.membership.tenantId ?? 'platform'}`} value={index}>
            {context.app?.name ?? context.membership.appId} / {context.tenant?.name ?? 'Platform'}
          </option>
        ))
      ) : (
        <option>Context</option>
      )}
    </select>
  );
}

function Overview() {
  const auth = useAuth();
  const summary = useQuery({
    queryKey: ['dashboard', auth.activeContext],
    queryFn: () => getDashboard(auth.activeContext),
  });
  const metrics = useMemo(() => Object.entries(summary.data ?? {}), [summary.data]);

  return (
    <Page title="Overview" right={<span className="status-pill">Alpha</span>}>
      <div className="metric-grid">
        {(metrics.length ? metrics : [['apps', 0], ['tenants', 0], ['users', 0], ['orders', 0]]).map(([key, value]) => (
          <section className="metric-tile" key={key}>
            <span>{key}</span>
            <strong>{String(value)}</strong>
          </section>
        ))}
      </div>
      <section className="panel">
        <div className="panel-heading">
          <h2>Runtime</h2>
          <Activity size={18} />
        </div>
        <div className="runtime-grid">
          <RuntimeItem label="Auth" value="JWT + RBAC" />
          <RuntimeItem label="Tenant" value="Header + session context" />
          <RuntimeItem label="AI" value="OpenAI-compatible gateway" />
          <RuntimeItem label="RAG" value="pgvector + object storage" />
        </div>
      </section>
    </Page>
  );
}

function ResourcePage({ title, endpoint }: { title: string; endpoint: string }) {
  const auth = useAuth();
  const query = useQuery({
    queryKey: ['resource', endpoint, auth.activeContext],
    queryFn: () => listResource<Record<string, unknown>>(endpoint, auth.activeContext),
  });

  return (
    <Page title={title} right={<button className="secondary-button">New</button>}>
      <section className="panel">
        {query.error ? <ErrorBanner error={query.error} /> : null}
        <DataTable rows={query.data ?? []} loading={query.isLoading} />
      </section>
    </Page>
  );
}

function Page({ title, right, children }: { title: string; right?: ReactNode; children: ReactNode }) {
  return (
    <>
      <div className="page-header">
        <div>
          <h1>{title}</h1>
          <p>OpenMole Admin</p>
        </div>
        {right}
      </div>
      {children}
    </>
  );
}

function DataTable({ rows, loading }: { rows: Record<string, unknown>[]; loading: boolean }) {
  const columns = useMemo(() => {
    const keys = new Set<string>();
    rows.slice(0, 5).forEach((row) => Object.keys(row).slice(0, 6).forEach((key) => keys.add(key)));
    return [...keys];
  }, [rows]);

  if (loading) return <div className="empty-state">Loading</div>;
  if (!rows.length) return <div className="empty-state">No records</div>;

  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column}>{column}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={String(row.id ?? index)}>
              {columns.map((column) => (
                <td key={column}>{formatCell(row[column])}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RuntimeItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="runtime-item">
      <Boxes size={16} />
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function ErrorBanner({ error }: { error: unknown }) {
  const message = error instanceof ApiError ? `${error.body?.code ?? error.status}: ${error.message}` : 'Request failed';
  return <div className="error-banner">{message}</div>;
}

function formatCell(value: unknown) {
  if (value === null || value === undefined) return '-';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}
