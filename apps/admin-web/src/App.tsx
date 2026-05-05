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
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ApiError,
  createResource,
  getDashboard,
  listResource,
  loadContexts,
  loadMenus,
  login,
  logout,
  runResourceAction,
  updateResource,
} from './api';
import { useAuth } from './AuthContext';
import { ContextOption } from './types';

const navItems = [
  { path: '/', label: '总览', icon: LayoutDashboard },
  { path: '/apps', label: '应用管理', icon: AppWindow, endpoint: '/admin/v1/apps' },
  { path: '/tenants', label: '租户管理', icon: Building2, endpoint: '/admin/v1/tenants' },
  { path: '/users', label: '用户管理', icon: Users, endpoint: '/admin/v1/users' },
  { path: '/billing', label: '计费套餐', icon: CreditCard, endpoint: '/admin/v1/plans' },
  { path: '/ai', label: 'AI 中心', icon: BrainCircuit, endpoint: '/admin/v1/ai/providers' },
  { path: '/knowledge', label: '知识库', icon: Database, endpoint: '/admin/v1/knowledge-bases' },
  { path: '/developer', label: '开发者中心', icon: KeyRound, endpoint: '/admin/v1/developer/api-keys' },
  { path: '/audit', label: '审计日志', icon: ScrollText, endpoint: '/admin/v1/audit-logs' },
  { path: '/system', label: '系统设置', icon: Settings, endpoint: '/admin/v1/system/settings' },
];

const metricLabels: Record<string, string> = {
  apps: '应用',
  tenants: '租户',
  users: '用户',
  orders: '订单',
  subscriptions: '订阅',
  apiKeys: 'API 密钥',
  knowledgeBases: '知识库',
};

const columnLabels: Record<string, string> = {
  id: 'ID',
  name: '名称',
  appKey: '应用标识',
  tenantKey: '租户标识',
  email: '邮箱',
  displayName: '显示名',
  status: '状态',
  createdAt: '创建时间',
  updatedAt: '更新时间',
  appId: '应用 ID',
  tenantId: '租户 ID',
  userId: '用户 ID',
  roleKey: '角色标识',
  provider: '提供商',
  title: '标题',
  action: '操作',
  resource: '资源',
};

interface FieldConfig {
  key: string;
  label: string;
  required?: boolean;
  type?: 'text' | 'select' | 'textarea' | 'checkbox' | 'password';
  options?: Array<{ label: string; value: string }>;
  placeholder?: string;
}

interface ResourceConfig {
  endpoint: string;
  columns?: string[];
  filters?: FieldConfig[];
  fields: FieldConfig[];
  createTitle: string;
  editTitle: string;
  transform?(values: Record<string, string>, mode: 'create' | 'edit'): Record<string, unknown>;
  actions?: Array<{
    label: string;
    tone?: 'danger' | 'primary';
    run(row: Record<string, unknown>, context?: { appId?: string; tenantId?: string | null }): Promise<unknown>;
  }>;
}

const statusOptions = [
  { label: '启用', value: 'active' },
  { label: '停用', value: 'disabled' },
  { label: '未启用', value: 'inactive' },
  { label: '归档', value: 'archived' },
];

const tenantStatusOptions = [
  { label: '待审核', value: 'pending_review' },
  { label: '启用', value: 'active' },
  { label: '驳回', value: 'rejected' },
  { label: '停用', value: 'disabled' },
  { label: '逾期', value: 'overdue' },
  { label: '过期', value: 'expired' },
];

const resourceConfigs: Record<string, ResourceConfig> = {
  '/admin/v1/apps': {
    endpoint: '/admin/v1/apps',
    columns: ['name', 'appKey', 'appType', 'domain', 'status', 'createdAt'],
    filters: [
      { key: 'q', label: '搜索', placeholder: '应用名称 / 标识 / 域名' },
      { key: 'appType', label: '应用类型', placeholder: 'saas' },
      { key: 'status', label: '状态', type: 'select', options: statusOptions },
    ],
    createTitle: '新建应用',
    editTitle: '编辑应用',
    fields: [
      { key: 'name', label: '应用名称', required: true },
      { key: 'appKey', label: '应用标识', required: true, placeholder: 'lowercase_key' },
      { key: 'appType', label: '应用类型', required: true, placeholder: 'saas' },
      { key: 'domain', label: '域名' },
      { key: 'defaultPlanId', label: '默认套餐 ID' },
      { key: 'status', label: '状态', type: 'select', options: statusOptions },
      { key: 'configText', label: '应用配置 JSON', type: 'textarea', placeholder: '{"theme":"default"}' },
    ],
    transform(values) {
      return {
        name: values.name,
        appKey: values.appKey,
        appType: values.appType,
        domain: values.domain || undefined,
        defaultPlanId: values.defaultPlanId || undefined,
        status: values.status || undefined,
        config: values.configText ? JSON.parse(values.configText) : undefined,
      };
    },
    actions: [
      {
        label: '禁用',
        tone: 'danger',
        run: (row, context) => runResourceAction(`/admin/v1/apps/${String(row.id)}/disable`, context),
      },
    ],
  },
  '/admin/v1/tenants': {
    endpoint: '/admin/v1/tenants',
    columns: ['name', 'appId', 'tenantType', 'contactName', 'email', 'industry', 'region', 'status', 'createdAt'],
    filters: [
      { key: 'appId', label: '应用 ID' },
      { key: 'status', label: '状态', type: 'select', options: tenantStatusOptions },
    ],
    createTitle: '新建租户',
    editTitle: '编辑租户',
    fields: [
      { key: 'appId', label: '应用 ID', required: true },
      { key: 'name', label: '租户名称', required: true },
      { key: 'tenantType', label: '租户类型', placeholder: 'customer' },
      { key: 'contactName', label: '联系人' },
      { key: 'phone', label: '联系电话' },
      { key: 'email', label: '联系邮箱' },
      { key: 'industry', label: '行业' },
      { key: 'region', label: '地区' },
      { key: 'source', label: '来源' },
      { key: 'status', label: '状态', type: 'select', options: tenantStatusOptions },
      { key: 'initializeRoles', label: '初始化租户角色', type: 'checkbox' },
      { key: 'ownerEmail', label: 'Owner 邮箱' },
      { key: 'ownerDisplayName', label: 'Owner 姓名' },
      { key: 'ownerPassword', label: 'Owner 初始密码', type: 'password' },
      { key: 'remark', label: '备注', type: 'textarea' },
    ],
    transform(values, mode) {
      const payload: Record<string, unknown> = {
        appId: values.appId,
        name: values.name,
        tenantType: values.tenantType || undefined,
        contactName: values.contactName || undefined,
        phone: values.phone || undefined,
        email: values.email || undefined,
        industry: values.industry || undefined,
        region: values.region || undefined,
        source: values.source || undefined,
        status: values.status || undefined,
        remark: values.remark || undefined,
      };
      if (mode === 'create') {
        payload.initializeRoles = values.initializeRoles === 'true';
        const owner = {
          email: values.ownerEmail || undefined,
          displayName: values.ownerDisplayName || undefined,
          password: values.ownerPassword || undefined,
        };
        if (Object.values(owner).some(Boolean)) payload.owner = owner;
      }
      return payload;
    },
    actions: [
      {
        label: '审核通过',
        tone: 'primary',
        run: (row, context) => runResourceAction(`/admin/v1/tenants/${String(row.id)}/approve`, context),
      },
      {
        label: '初始化角色',
        tone: 'primary',
        run: (row, context) => runResourceAction(`/admin/v1/tenants/${String(row.id)}/initialize-roles`, context),
      },
      {
        label: '禁用',
        tone: 'danger',
        run: (row, context) => runResourceAction(`/admin/v1/tenants/${String(row.id)}/disable`, context),
      },
    ],
  },
  '/admin/v1/system/settings': {
    endpoint: '/admin/v1/system/settings',
    columns: ['key', 'scope', 'appId', 'tenantId', 'value', 'updatedAt'],
    filters: [
      { key: 'key', label: '配置键' },
      { key: 'scope', label: '作用域' },
    ],
    createTitle: '保存设置',
    editTitle: '编辑设置',
    fields: [
      { key: 'key', label: '配置键', required: true },
      { key: 'scope', label: '作用域', placeholder: 'system' },
      { key: 'valueText', label: 'JSON 值', required: true, type: 'textarea', placeholder: '{"enabled":true}' },
    ],
    transform(values) {
      return {
        key: values.key,
        scope: values.scope || 'system',
        value: values.valueText ? JSON.parse(values.valueText) : {},
      };
    },
  },
};

const errorMessages: Record<string, string> = {
  UNAUTHORIZED: '账号或密码不正确',
  INVALID_REQUEST_BODY: '请求内容格式不正确',
  VALIDATION_FAILED: '表单校验失败，请检查输入内容',
  RATE_LIMITED: '请求过于频繁，请稍后再试',
  NETWORK_ERROR: '无法连接后端服务',
  NOT_FOUND: '接口或资源不存在',
};

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
      setError(formatError(err));
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
            <p>管理控制台</p>
          </div>
        </div>
        <form className="login-form" onSubmit={onSubmit}>
          <label>
            邮箱
            <input value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" />
          </label>
          <label>
            密码
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
            {loading ? '正在登录' : '登录'}
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
            <span>控制平面</span>
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
          <button className="icon-button" title="导航">
            <Menu size={18} />
          </button>
          <div className="search-box">
            <Search size={17} />
            <input placeholder="搜索记录" />
          </div>
          <ContextSelect
            contexts={contexts.data ?? []}
            onChange={(context) => auth.setActiveContext(context)}
          />
          <div className="user-chip">
            <span>{auth.user?.displayName ?? auth.user?.email ?? '管理员'}</span>
          </div>
          <button className="icon-button" onClick={onLogout} title="退出登录">
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
            {context.app?.name ?? context.membership.appId} / {context.tenant?.name ?? '平台'}
          </option>
        ))
      ) : (
        <option>上下文</option>
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
    <Page title="总览" right={<span className="status-pill">Alpha</span>}>
      <div className="metric-grid">
        {(metrics.length ? metrics : [['apps', 0], ['tenants', 0], ['users', 0], ['orders', 0]]).map(([key, value]) => (
          <section className="metric-tile" key={key}>
            <span>{metricLabels[key] ?? key}</span>
            <strong>{String(value)}</strong>
          </section>
        ))}
      </div>
      <section className="panel">
        <div className="panel-heading">
          <h2>运行状态</h2>
          <Activity size={18} />
        </div>
        <div className="runtime-grid">
          <RuntimeItem label="认证" value="JWT + RBAC" />
          <RuntimeItem label="租户" value="请求头 + 会话上下文" />
          <RuntimeItem label="AI" value="OpenAI 兼容网关" />
          <RuntimeItem label="知识检索" value="pgvector + 对象存储" />
        </div>
      </section>
    </Page>
  );
}

function ResourcePage({ title, endpoint }: { title: string; endpoint: string }) {
  const auth = useAuth();
  const queryClient = useQueryClient();
  const config = resourceConfigs[endpoint];
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [drawer, setDrawer] = useState<{
    mode: 'create' | 'edit';
    row?: Record<string, unknown>;
  }>();
  const [detailRow, setDetailRow] = useState<Record<string, unknown>>();
  const [membersTenant, setMembersTenant] = useState<Record<string, unknown>>();
  const [toast, setToast] = useState<string>();
  const query = useQuery({
    queryKey: ['resource', endpoint, auth.activeContext, filters],
    queryFn: () => listResource<Record<string, unknown>>(endpoint, auth.activeContext, filters),
  });
  const saveMutation = useMutation({
    mutationFn: (values: Record<string, string>) => {
      if (!config) throw new Error('Unsupported resource');
      const payload = config.transform
        ? config.transform(values, drawer?.mode ?? 'create')
        : compactValues(values);
      if (drawer?.mode === 'edit' && drawer.row?.id && endpoint !== '/admin/v1/system/settings') {
        return updateResource(`${endpoint}/${String(drawer.row.id)}`, payload, auth.activeContext);
      }
      return createResource(endpoint, payload, auth.activeContext);
    },
    onSuccess: async () => {
      setDrawer(undefined);
      setToast(drawer?.mode === 'edit' ? '已保存修改' : '已创建记录');
      await queryClient.invalidateQueries({ queryKey: ['resource', endpoint] });
    },
  });
  const actionMutation = useMutation({
    mutationFn: (input: { row: Record<string, unknown>; actionIndex: number }) => {
      const action = config?.actions?.[input.actionIndex];
      if (!action) throw new Error('Unsupported action');
      if (!window.confirm(`确认执行“${action.label}”？`)) {
        return Promise.resolve(undefined);
      }
      return action.run(input.row, auth.activeContext);
    },
    onSuccess: async () => {
      setToast('操作已完成');
      await queryClient.invalidateQueries({ queryKey: ['resource', endpoint] });
    },
  });

  return (
    <Page
      title={title}
      right={
        config ? (
          <button className="secondary-button" onClick={() => setDrawer({ mode: 'create' })}>
            新建
          </button>
        ) : undefined
      }
    >
      <section className="panel">
        {toast ? (
          <div className="success-banner">
            <span>{toast}</span>
            <button type="button" onClick={() => setToast(undefined)}>
              关闭
            </button>
          </div>
        ) : null}
        {config?.filters?.length ? (
          <FilterBar fields={config.filters} values={filters} onChange={setFilters} />
        ) : null}
        {query.error ? <ErrorBanner error={query.error} /> : null}
        {saveMutation.error ? <ErrorBanner error={saveMutation.error} /> : null}
        {actionMutation.error ? <ErrorBanner error={actionMutation.error} /> : null}
        <DataTable
          rows={query.data ?? []}
          loading={query.isLoading}
          preferredColumns={config?.columns}
          onView={(row) => setDetailRow(row)}
          onEdit={config ? (row) => setDrawer({ mode: 'edit', row }) : undefined}
          actions={config?.actions?.map((action, actionIndex) => ({
            label: action.label,
            tone: action.tone,
            onClick: (row) => actionMutation.mutate({ row, actionIndex }),
          }))}
          extraActions={
            endpoint === '/admin/v1/tenants'
              ? [
                  {
                    label: '成员',
                    onClick: (row) => setMembersTenant(row),
                  },
                ]
              : undefined
          }
        />
      </section>
      {config && drawer ? (
        <ResourceDrawer
          config={config}
          mode={drawer.mode}
          row={drawer.row}
          saving={saveMutation.isPending}
          onClose={() => setDrawer(undefined)}
          onSubmit={(values) => saveMutation.mutate(values)}
        />
      ) : null}
      {detailRow ? (
        <DetailDrawer row={detailRow} title={`${title}详情`} onClose={() => setDetailRow(undefined)} />
      ) : null}
      {membersTenant ? (
        <TenantMembersDrawer
          tenant={membersTenant}
          context={auth.activeContext}
          onClose={() => setMembersTenant(undefined)}
        />
      ) : null}
    </Page>
  );
}

function Page({ title, right, children }: { title: string; right?: ReactNode; children: ReactNode }) {
  return (
    <>
      <div className="page-header">
        <div>
          <h1>{title}</h1>
          <p>OpenMole 管理控制台</p>
        </div>
        {right}
      </div>
      {children}
    </>
  );
}

function FilterBar({
  fields,
  values,
  onChange,
}: {
  fields: FieldConfig[];
  values: Record<string, string>;
  onChange(values: Record<string, string>): void;
}) {
  return (
    <div className="filter-bar">
      {fields.map((field) => (
        <label key={field.key}>
          <span>{field.label}</span>
          {field.type === 'select' ? (
            <select
              value={values[field.key] ?? ''}
              onChange={(event) => onChange({ ...values, [field.key]: event.target.value })}
            >
              <option value="">全部</option>
              {field.options?.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          ) : (
            <input
              value={values[field.key] ?? ''}
              placeholder={field.placeholder}
              onChange={(event) => onChange({ ...values, [field.key]: event.target.value })}
            />
          )}
        </label>
      ))}
      <button type="button" className="ghost-button" onClick={() => onChange({})}>
        重置
      </button>
    </div>
  );
}

function DataTable({
  rows,
  loading,
  preferredColumns,
  onView,
  onEdit,
  actions,
  extraActions,
}: {
  rows: Record<string, unknown>[];
  loading: boolean;
  preferredColumns?: string[];
  onView?: (row: Record<string, unknown>) => void;
  onEdit?: (row: Record<string, unknown>) => void;
  actions?: Array<{
    label: string;
    tone?: 'danger' | 'primary';
    onClick(row: Record<string, unknown>): void;
  }>;
  extraActions?: Array<{
    label: string;
    onClick(row: Record<string, unknown>): void;
  }>;
}) {
  const columns = useMemo(() => {
    if (preferredColumns?.length) return preferredColumns;
    const keys = new Set<string>();
    rows.slice(0, 5).forEach((row) => Object.keys(row).slice(0, 6).forEach((key) => keys.add(key)));
    return [...keys];
  }, [preferredColumns, rows]);

  if (loading) return <div className="empty-state">加载中</div>;
  if (!rows.length) return <div className="empty-state">暂无数据</div>;

  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column}>{columnLabels[column] ?? column}</th>
            ))}
            {onView || onEdit || actions?.length || extraActions?.length ? <th>操作</th> : null}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={String(row.id ?? index)}>
              {columns.map((column) => (
                <td key={column}>{formatCell(row[column])}</td>
              ))}
              {onView || onEdit || actions?.length || extraActions?.length ? (
                <td>
                  <div className="table-actions">
                    {extraActions?.map((action) => (
                      <button type="button" key={action.label} onClick={() => action.onClick(row)}>
                        {action.label}
                      </button>
                    ))}
                    {onView ? (
                      <button type="button" onClick={() => onView(row)}>
                        详情
                      </button>
                    ) : null}
                    {onEdit ? (
                      <button type="button" onClick={() => onEdit(row)}>
                        编辑
                      </button>
                    ) : null}
                    {actions?.map((action) => (
                      <button
                        type="button"
                        className={action.tone === 'danger' ? 'danger-link' : undefined}
                        key={action.label}
                        onClick={() => action.onClick(row)}
                      >
                        {action.label}
                      </button>
                    ))}
                  </div>
                </td>
              ) : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ResourceDrawer({
  config,
  mode,
  row,
  saving,
  onClose,
  onSubmit,
}: {
  config: ResourceConfig;
  mode: 'create' | 'edit';
  row?: Record<string, unknown>;
  saving: boolean;
  onClose(): void;
  onSubmit(values: Record<string, string>): void;
}) {
  const [values, setValues] = useState<Record<string, string>>(() => initialValues(config, row));

  function submit(event: FormEvent) {
    event.preventDefault();
    onSubmit(values);
  }

  return (
    <div className="drawer-backdrop">
      <aside className="drawer-panel">
        <div className="drawer-header">
          <div>
            <h2>{mode === 'create' ? config.createTitle : config.editTitle}</h2>
            <p>填写必要信息后保存</p>
          </div>
          <button className="icon-button" onClick={onClose} type="button">
            ×
          </button>
        </div>
        <form className="drawer-form" onSubmit={submit}>
          {config.fields.map((field) => (
            <label key={field.key}>
              {field.label}
              {field.type === 'select' ? (
                <select
                  required={field.required}
                  value={values[field.key] ?? ''}
                  onChange={(event) => setValues({ ...values, [field.key]: event.target.value })}
                >
                  <option value="">请选择</option>
                  {field.options?.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              ) : field.type === 'textarea' ? (
                <textarea
                  required={field.required}
                  placeholder={field.placeholder}
                  value={values[field.key] ?? ''}
                  onChange={(event) => setValues({ ...values, [field.key]: event.target.value })}
                />
              ) : field.type === 'checkbox' ? (
                <span className="checkbox-row">
                  <input
                    type="checkbox"
                    checked={values[field.key] === 'true'}
                    onChange={(event) => setValues({ ...values, [field.key]: String(event.target.checked) })}
                  />
                  <span>启用</span>
                </span>
              ) : (
                <input
                  type={field.type === 'password' ? 'password' : 'text'}
                  required={field.required}
                  placeholder={field.placeholder}
                  value={values[field.key] ?? ''}
                  onChange={(event) => setValues({ ...values, [field.key]: event.target.value })}
                />
              )}
            </label>
          ))}
          <div className="drawer-actions">
            <button type="button" className="ghost-button" onClick={onClose}>
              取消
            </button>
            <button type="submit" className="primary-button" disabled={saving}>
              {saving ? '保存中' : '保存'}
            </button>
          </div>
        </form>
      </aside>
    </div>
  );
}

function DetailDrawer({
  row,
  title,
  onClose,
}: {
  row: Record<string, unknown>;
  title: string;
  onClose(): void;
}) {
  const entries = Object.entries(row);
  return (
    <div className="drawer-backdrop">
      <aside className="drawer-panel">
        <div className="drawer-header">
          <div>
            <h2>{title}</h2>
            <p>查看当前记录的完整字段</p>
          </div>
          <button className="icon-button" onClick={onClose} type="button">
            ×
          </button>
        </div>
        <div className="detail-list">
          {entries.map(([key, value]) => (
            <div className="detail-row" key={key}>
              <span>{columnLabels[key] ?? key}</span>
              <strong>{formatCell(value)}</strong>
            </div>
          ))}
        </div>
      </aside>
    </div>
  );
}

function TenantMembersDrawer({
  tenant,
  context,
  onClose,
}: {
  tenant: Record<string, unknown>;
  context?: { appId?: string; tenantId?: string | null };
  onClose(): void;
}) {
  const queryClient = useQueryClient();
  const tenantId = String(tenant.id);
  const [values, setValues] = useState<Record<string, string>>({
    email: '',
    displayName: '',
    password: '',
    roleId: '',
  });
  const members = useQuery({
    queryKey: ['tenant-members', tenantId, context],
    queryFn: () => listResource<Record<string, unknown>>(`/admin/v1/tenants/${tenantId}/members`, context),
  });
  const roles = useQuery({
    queryKey: ['tenant-roles', tenantId, context],
    queryFn: () => listResource<Record<string, unknown>>(`/admin/v1/tenants/${tenantId}/roles`, context),
  });
  const addMember = useMutation({
    mutationFn: () =>
      createResource(`/admin/v1/tenants/${tenantId}/members`, compactValues(values), context),
    onSuccess: async () => {
      setValues({ email: '', displayName: '', password: '', roleId: '' });
      await queryClient.invalidateQueries({ queryKey: ['tenant-members', tenantId] });
    },
  });
  const disableMember = useMutation({
    mutationFn: (membershipId: string) => {
      if (!window.confirm('确认禁用该成员？')) return Promise.resolve(undefined);
      return runResourceAction(`/admin/v1/tenants/${tenantId}/members/${membershipId}/disable`, context);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['tenant-members', tenantId] });
    },
  });

  return (
    <div className="drawer-backdrop">
      <aside className="drawer-panel wide-drawer">
        <div className="drawer-header">
          <div>
            <h2>租户成员</h2>
            <p>{String(tenant.name ?? tenantId)}</p>
          </div>
          <button className="icon-button" onClick={onClose} type="button">
            ×
          </button>
        </div>
        <div className="members-content">
          {addMember.error ? <ErrorBanner error={addMember.error} /> : null}
          {disableMember.error ? <ErrorBanner error={disableMember.error} /> : null}
          <form
            className="inline-form"
            onSubmit={(event) => {
              event.preventDefault();
              addMember.mutate();
            }}
          >
            <label>
              邮箱
              <input
                required
                value={values.email}
                onChange={(event) => setValues({ ...values, email: event.target.value })}
              />
            </label>
            <label>
              姓名
              <input
                value={values.displayName}
                onChange={(event) => setValues({ ...values, displayName: event.target.value })}
              />
            </label>
            <label>
              初始密码
              <input
                required
                type="password"
                value={values.password}
                onChange={(event) => setValues({ ...values, password: event.target.value })}
              />
            </label>
            <label>
              角色
              <select
                required
                value={values.roleId}
                onChange={(event) => setValues({ ...values, roleId: event.target.value })}
              >
                <option value="">请选择</option>
                {(roles.data ?? []).map((role) => (
                  <option key={String(role.id)} value={String(role.id)}>
                    {String(role.name ?? role.roleKey ?? role.id)}
                  </option>
                ))}
              </select>
            </label>
            <button className="primary-button" type="submit" disabled={addMember.isPending}>
              {addMember.isPending ? '添加中' : '添加成员'}
            </button>
          </form>
          <DataTable
            rows={members.data ?? []}
            loading={members.isLoading}
            preferredColumns={['userId', 'roleId', 'status', 'createdAt']}
            actions={[
              {
                label: '禁用',
                tone: 'danger',
                onClick: (row) => disableMember.mutate(String(row.id)),
              },
            ]}
          />
        </div>
      </aside>
    </div>
  );
}

function initialValues(config: ResourceConfig, row?: Record<string, unknown>) {
  const values: Record<string, string> = {};
  for (const field of config.fields) {
    if (field.key === 'valueText') {
      values[field.key] = row?.value ? JSON.stringify(row.value, null, 2) : '';
    } else if (field.key === 'configText') {
      values[field.key] = row?.config ? JSON.stringify(row.config, null, 2) : '';
    } else if (field.type === 'checkbox') {
      values[field.key] = row?.[field.key] ? 'true' : '';
    } else {
      values[field.key] = row?.[field.key] === undefined ? '' : String(row[field.key] ?? '');
    }
  }
  return values;
}

function compactValues(values: Record<string, string>) {
  return Object.fromEntries(
    Object.entries(values).filter(([, value]) => value !== ''),
  );
}

function statusLabel(value: string) {
  return (
    [...statusOptions, ...tenantStatusOptions].find((option) => option.value === value)
      ?.label ?? value
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
  return <div className="error-banner">{formatError(error)}</div>;
}

function formatError(error: unknown) {
  if (error instanceof SyntaxError) return 'JSON 格式不正确，请检查配置内容';
  if (error instanceof Error && error.message === 'JSON_PARSE_FAILED') {
    return 'JSON 格式不正确，请检查配置内容';
  }
  if (!(error instanceof ApiError)) return '请求失败';
  const code = error.body?.code;
  const message = code ? errorMessages[code] : undefined;
  return `${code ?? error.status}: ${message ?? error.message}`;
}

function formatCell(value: unknown) {
  if (value === null || value === undefined) return '-';
  if (typeof value === 'string' && [...statusOptions, ...tenantStatusOptions].some((option) => option.value === value)) {
    return statusLabel(value);
  }
  if (typeof value === 'string' && value.includes('T') && !Number.isNaN(Date.parse(value))) {
    return new Intl.DateTimeFormat('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(value));
  }
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}
