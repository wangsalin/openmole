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
  phone: '手机号',
  displayName: '显示名',
  avatarUrl: '头像',
  lastLoginAt: '最后登录',
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
  planId: '套餐 ID',
  orderNo: '订单号',
  amount: '金额',
  currency: '币种',
  startAt: '开始时间',
  endAt: '结束时间',
  autoRenew: '自动续费',
  featureKey: '功能',
  metric: '指标',
  quantity: '数量',
  costAmount: '成本金额',
  chargeAmount: '计费金额',
  occurredAt: '发生时间',
  limit: '上限',
  used: '已用',
  periodStart: '周期开始',
  periodEnd: '周期结束',
  roleId: '角色 ID',
  featureId: '功能 ID',
  featureName: '功能名称',
  module: '模块',
  description: '描述',
  isMetered: '计量',
  priceMonthly: '月付价格',
  priceYearly: '年付价格',
  isPublic: '公开',
  isRecommended: '推荐',
  quotaType: '额度类型',
  quotaLimit: '额度上限',
  resetCycle: '重置周期',
  enabled: '启用',
  providerKey: '提供商标识',
  baseUrl: 'Base URL',
  secretRef: '密钥引用',
  providerId: '提供商 ID',
  modelKey: '模型标识',
  modality: '模态',
  inputTokenPrice: '输入单价',
  outputTokenPrice: '输出单价',
  routeKey: '路由标识',
  primaryModelId: '主模型',
  fallbackModelId: '备用模型',
};

interface FieldConfig {
  key: string;
  label: string;
  required?: boolean;
  type?: 'text' | 'select' | 'textarea' | 'checkbox' | 'password';
  options?: Array<{ label: string; value: string }>;
  placeholder?: string;
  defaultValue?: string;
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

const tenantOperationTabs = [
  {
    key: 'subscriptions',
    label: '订阅',
    endpoint: '/admin/v1/subscriptions',
    columns: ['planId', 'status', 'startAt', 'endAt', 'autoRenew', 'createdAt'],
  },
  {
    key: 'orders',
    label: '订单',
    endpoint: '/admin/v1/orders',
    columns: ['orderNo', 'planId', 'status', 'amount', 'currency', 'createdAt'],
  },
  {
    key: 'ledger',
    label: '用量流水',
    endpoint: '/admin/v1/usage/ledger',
    columns: ['featureKey', 'metric', 'quantity', 'costAmount', 'chargeAmount', 'occurredAt'],
  },
  {
    key: 'quotas',
    label: '额度',
    endpoint: '/admin/v1/usage/quotas',
    columns: ['featureKey', 'metric', 'limit', 'used', 'periodStart', 'periodEnd'],
  },
  {
    key: 'audit',
    label: '审计',
    endpoint: '/admin/v1/audit-logs',
    columns: ['action', 'resource', 'userId', 'createdAt'],
  },
] as const;

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
  '/admin/v1/users': {
    endpoint: '/admin/v1/users',
    columns: ['email', 'displayName', 'phone', 'status', 'lastLoginAt', 'createdAt'],
    filters: [
      { key: 'q', label: '搜索', placeholder: '邮箱 / 姓名 / 手机号' },
      { key: 'status', label: '状态', type: 'select', options: statusOptions },
    ],
    createTitle: '新建用户',
    editTitle: '编辑用户',
    fields: [
      { key: 'email', label: '邮箱', required: true },
      { key: 'phone', label: '手机号' },
      { key: 'displayName', label: '显示名' },
      { key: 'password', label: '密码', type: 'password', placeholder: '编辑时留空则不修改' },
      { key: 'avatarUrl', label: '头像 URL' },
      { key: 'status', label: '状态', type: 'select', options: statusOptions },
    ],
    transform(values, mode) {
      return {
        email: values.email || undefined,
        phone: values.phone || undefined,
        displayName: values.displayName || undefined,
        password: mode === 'create' || values.password ? values.password || undefined : undefined,
        avatarUrl: values.avatarUrl || undefined,
        status: values.status || undefined,
      };
    },
    actions: [
      {
        label: '禁用',
        tone: 'danger',
        run: (row, context) =>
          updateResource(`/admin/v1/users/${String(row.id)}`, { status: 'disabled' }, context),
      },
      {
        label: '启用',
        tone: 'primary',
        run: (row, context) =>
          updateResource(`/admin/v1/users/${String(row.id)}`, { status: 'active' }, context),
      },
    ],
  },
  '/admin/v1/plans': {
    endpoint: '/admin/v1/plans',
    columns: ['name', 'appId', 'priceMonthly', 'priceYearly', 'isPublic', 'isRecommended', 'status', 'createdAt'],
    filters: [
      { key: 'appId', label: '应用 ID' },
      { key: 'status', label: '状态', type: 'select', options: statusOptions },
    ],
    createTitle: '新建套餐',
    editTitle: '编辑套餐',
    fields: [
      { key: 'appId', label: '应用 ID', required: true },
      { key: 'name', label: '套餐名称', required: true },
      { key: 'description', label: '描述', type: 'textarea' },
      { key: 'priceMonthly', label: '月付价格', placeholder: '0' },
      { key: 'priceYearly', label: '年付价格', placeholder: '0' },
      { key: 'isPublic', label: '公开展示', type: 'checkbox', defaultValue: 'true' },
      { key: 'isRecommended', label: '推荐套餐', type: 'checkbox' },
      { key: 'status', label: '状态', type: 'select', options: statusOptions },
    ],
    transform(values) {
      return {
        appId: values.appId,
        name: values.name,
        description: values.description || undefined,
        priceMonthly: values.priceMonthly ? Number(values.priceMonthly) : undefined,
        priceYearly: values.priceYearly ? Number(values.priceYearly) : undefined,
        isPublic: values.isPublic === 'true',
        isRecommended: values.isRecommended === 'true',
        status: values.status || undefined,
      };
    },
    actions: [
      {
        label: '停用',
        tone: 'danger',
        run: (row, context) =>
          updateResource(`/admin/v1/plans/${String(row.id)}`, { status: 'disabled' }, context),
      },
      {
        label: '启用',
        tone: 'primary',
        run: (row, context) =>
          updateResource(`/admin/v1/plans/${String(row.id)}`, { status: 'active' }, context),
      },
    ],
  },
  '/admin/v1/features': {
    endpoint: '/admin/v1/features',
    columns: ['featureKey', 'name', 'module', 'isMetered', 'status', 'createdAt'],
    filters: [
      { key: 'module', label: '模块' },
      { key: 'status', label: '状态', type: 'select', options: statusOptions },
    ],
    createTitle: '新建功能项',
    editTitle: '编辑功能项',
    fields: [
      { key: 'featureKey', label: '功能标识', required: true, placeholder: 'api_calls' },
      { key: 'name', label: '功能名称', required: true },
      { key: 'module', label: '所属模块', required: true, placeholder: 'billing' },
      { key: 'description', label: '描述', type: 'textarea' },
      { key: 'isMetered', label: '按量计量', type: 'checkbox' },
      { key: 'status', label: '状态', type: 'select', options: statusOptions },
    ],
    transform(values) {
      return {
        featureKey: values.featureKey,
        name: values.name,
        module: values.module,
        description: values.description || undefined,
        isMetered: values.isMetered === 'true',
        status: values.status || undefined,
      };
    },
    actions: [
      {
        label: '停用',
        tone: 'danger',
        run: (row, context) =>
          updateResource(`/admin/v1/features/${String(row.id)}`, { status: 'disabled' }, context),
      },
      {
        label: '启用',
        tone: 'primary',
        run: (row, context) =>
          updateResource(`/admin/v1/features/${String(row.id)}`, { status: 'active' }, context),
      },
    ],
  },
  '/admin/v1/ai/providers': {
    endpoint: '/admin/v1/ai/providers',
    columns: ['providerKey', 'name', 'baseUrl', 'secretRef', 'status', 'createdAt'],
    filters: [
      { key: 'status', label: '状态', type: 'select', options: statusOptions },
    ],
    createTitle: '新建 AI 提供商',
    editTitle: '编辑 AI 提供商',
    fields: [
      { key: 'providerKey', label: '提供商标识', required: true, placeholder: 'deepseek' },
      { key: 'name', label: '提供商名称', required: true },
      { key: 'baseUrl', label: 'Base URL', placeholder: 'https://api.deepseek.com' },
      { key: 'secretRef', label: '密钥引用', placeholder: 'secret://ai/deepseek' },
      { key: 'status', label: '状态', type: 'select', options: statusOptions },
      { key: 'configText', label: '配置 JSON', type: 'textarea', placeholder: '{"compatible":"openai"}' },
    ],
    transform(values) {
      return {
        providerKey: values.providerKey,
        name: values.name,
        baseUrl: values.baseUrl || undefined,
        secretRef: values.secretRef || undefined,
        status: values.status || undefined,
        config: values.configText ? JSON.parse(values.configText) : undefined,
      };
    },
    actions: [
      {
        label: '停用',
        tone: 'danger',
        run: (row, context) =>
          updateResource(`/admin/v1/ai/providers/${String(row.id)}`, { status: 'disabled' }, context),
      },
      {
        label: '启用',
        tone: 'primary',
        run: (row, context) =>
          updateResource(`/admin/v1/ai/providers/${String(row.id)}`, { status: 'active' }, context),
      },
    ],
  },
  '/admin/v1/ai/models': {
    endpoint: '/admin/v1/ai/models',
    columns: ['modelKey', 'name', 'providerId', 'modality', 'inputTokenPrice', 'outputTokenPrice', 'status', 'createdAt'],
    filters: [
      { key: 'providerId', label: '提供商 ID' },
      { key: 'modality', label: '模态', placeholder: 'text' },
      { key: 'status', label: '状态', type: 'select', options: statusOptions },
    ],
    createTitle: '新建 AI 模型',
    editTitle: '编辑 AI 模型',
    fields: [
      { key: 'providerId', label: '提供商', required: true },
      { key: 'modelKey', label: '模型标识', required: true, placeholder: 'deepseek-chat' },
      { key: 'name', label: '模型名称', required: true },
      { key: 'modality', label: '模态', placeholder: 'text' },
      { key: 'inputTokenPrice', label: '输入 token 单价', placeholder: '0' },
      { key: 'outputTokenPrice', label: '输出 token 单价', placeholder: '0' },
      { key: 'status', label: '状态', type: 'select', options: statusOptions },
      { key: 'configText', label: '配置 JSON', type: 'textarea', placeholder: '{"maxTokens":8192}' },
    ],
    transform(values) {
      return {
        providerId: values.providerId,
        modelKey: values.modelKey,
        name: values.name,
        modality: values.modality || undefined,
        inputTokenPrice: values.inputTokenPrice ? Number(values.inputTokenPrice) : undefined,
        outputTokenPrice: values.outputTokenPrice ? Number(values.outputTokenPrice) : undefined,
        status: values.status || undefined,
        config: values.configText ? JSON.parse(values.configText) : undefined,
      };
    },
    actions: [
      {
        label: '停用',
        tone: 'danger',
        run: (row, context) =>
          updateResource(`/admin/v1/ai/models/${String(row.id)}`, { status: 'disabled' }, context),
      },
      {
        label: '启用',
        tone: 'primary',
        run: (row, context) =>
          updateResource(`/admin/v1/ai/models/${String(row.id)}`, { status: 'active' }, context),
      },
    ],
  },
  '/admin/v1/ai/routes': {
    endpoint: '/admin/v1/ai/routes',
    columns: ['routeKey', 'appId', 'tenantId', 'primaryModelId', 'fallbackModelId', 'status', 'updatedAt'],
    filters: [
      { key: 'appId', label: '应用 ID' },
      { key: 'tenantId', label: '租户 ID' },
      { key: 'routeKey', label: '路由标识' },
      { key: 'status', label: '状态', type: 'select', options: statusOptions },
    ],
    createTitle: '新建模型路由',
    editTitle: '编辑模型路由',
    fields: [
      { key: 'appId', label: '应用 ID' },
      { key: 'tenantId', label: '租户 ID' },
      { key: 'routeKey', label: '路由标识', required: true, placeholder: 'chat' },
      { key: 'primaryModelId', label: '主模型', required: true },
      { key: 'fallbackModelId', label: '备用模型' },
      { key: 'status', label: '状态', type: 'select', options: statusOptions },
      { key: 'configText', label: '配置 JSON', type: 'textarea', placeholder: '{"temperature":0.7}' },
    ],
    transform(values) {
      return {
        appId: values.appId || undefined,
        tenantId: values.tenantId || undefined,
        routeKey: values.routeKey,
        primaryModelId: values.primaryModelId,
        fallbackModelId: values.fallbackModelId || undefined,
        status: values.status || undefined,
        config: values.configText ? JSON.parse(values.configText) : undefined,
      };
    },
    actions: [
      {
        label: '停用',
        tone: 'danger',
        run: (row, context) =>
          updateResource(`/admin/v1/ai/routes/${String(row.id)}`, { status: 'disabled' }, context),
      },
      {
        label: '启用',
        tone: 'primary',
        run: (row, context) =>
          updateResource(`/admin/v1/ai/routes/${String(row.id)}`, { status: 'active' }, context),
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
                  element={
                    item.path === '/ai' ? (
                      <AiCenterPage title={item.label} />
                    ) : (
                      <ResourcePage title={item.label} endpoint={item.endpoint!} />
                    )
                  }
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

const aiTabs = [
  { key: '/admin/v1/ai/providers', label: '提供商' },
  { key: '/admin/v1/ai/models', label: '模型' },
  { key: '/admin/v1/ai/routes', label: '路由' },
] as const;

function AiCenterPage({ title }: { title: string }) {
  const auth = useAuth();
  const queryClient = useQueryClient();
  const [endpoint, setEndpoint] = useState<(typeof aiTabs)[number]['key']>('/admin/v1/ai/providers');
  const [filtersByEndpoint, setFiltersByEndpoint] = useState<Record<string, Record<string, string>>>({});
  const [drawer, setDrawer] = useState<{
    mode: 'create' | 'edit';
    row?: Record<string, unknown>;
  }>();
  const [detailRow, setDetailRow] = useState<Record<string, unknown>>();
  const [toast, setToast] = useState<string>();
  const providers = useQuery({
    queryKey: ['ai-provider-options', auth.activeContext],
    queryFn: () =>
      listResource<Record<string, unknown>>('/admin/v1/ai/providers', auth.activeContext, {
        status: 'active',
      }),
  });
  const models = useQuery({
    queryKey: ['ai-model-options', auth.activeContext],
    queryFn: () =>
      listResource<Record<string, unknown>>('/admin/v1/ai/models', auth.activeContext, {
        status: 'active',
      }),
  });
  const config = useMemo(() => {
    const base = resourceConfigs[endpoint];
    if (endpoint === '/admin/v1/ai/models') {
      return {
        ...base,
        fields: base.fields.map((field) =>
          field.key === 'providerId'
            ? {
                ...field,
                type: 'select' as const,
                options: (providers.data ?? []).map((provider) => ({
                  label: String(provider.name ?? provider.providerKey ?? provider.id),
                  value: String(provider.id),
                })),
              }
            : field,
        ),
      };
    }
    if (endpoint === '/admin/v1/ai/routes') {
      const modelOptions = (models.data ?? []).map((model) => ({
        label: String(model.name ?? model.modelKey ?? model.id),
        value: String(model.id),
      }));
      return {
        ...base,
        fields: base.fields.map((field) =>
          field.key === 'primaryModelId' || field.key === 'fallbackModelId'
            ? { ...field, type: 'select' as const, options: modelOptions }
            : field,
        ),
      };
    }
    return base;
  }, [endpoint, models.data, providers.data]);
  const filters = filtersByEndpoint[endpoint] ?? {};
  const query = useQuery({
    queryKey: ['ai-resource', endpoint, auth.activeContext, filters],
    queryFn: () => listResource<Record<string, unknown>>(endpoint, auth.activeContext, filters),
  });
  const saveMutation = useMutation({
    mutationFn: (values: Record<string, string>) => {
      const payload = config.transform
        ? config.transform(values, drawer?.mode ?? 'create')
        : compactValues(values);
      if (drawer?.mode === 'edit' && drawer.row?.id) {
        return updateResource(`${endpoint}/${String(drawer.row.id)}`, payload, auth.activeContext);
      }
      return createResource(endpoint, payload, auth.activeContext);
    },
    onSuccess: async () => {
      setDrawer(undefined);
      setToast(drawer?.mode === 'edit' ? '已保存修改' : '已创建记录');
      await queryClient.invalidateQueries({ queryKey: ['ai-resource', endpoint] });
      await queryClient.invalidateQueries({ queryKey: ['ai-provider-options'] });
      await queryClient.invalidateQueries({ queryKey: ['ai-model-options'] });
    },
  });
  const actionMutation = useMutation({
    mutationFn: (input: { row: Record<string, unknown>; actionIndex: number }) => {
      const action = config.actions?.[input.actionIndex];
      if (!action) throw new Error('Unsupported action');
      if (!window.confirm(`确认执行“${action.label}”？`)) return Promise.resolve(undefined);
      return action.run(input.row, auth.activeContext);
    },
    onSuccess: async () => {
      setToast('操作已完成');
      await queryClient.invalidateQueries({ queryKey: ['ai-resource', endpoint] });
      await queryClient.invalidateQueries({ queryKey: ['ai-provider-options'] });
      await queryClient.invalidateQueries({ queryKey: ['ai-model-options'] });
    },
  });

  return (
    <Page
      title={title}
      right={
        <button className="secondary-button" onClick={() => setDrawer({ mode: 'create' })}>
          新建
        </button>
      }
    >
      <section className="panel">
        <div className="tab-list" role="tablist" aria-label="AI 中心">
          {aiTabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              role="tab"
              aria-selected={endpoint === tab.key}
              className={endpoint === tab.key ? 'tab-button active' : 'tab-button'}
              onClick={() => {
                setEndpoint(tab.key);
                setDrawer(undefined);
                setDetailRow(undefined);
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>
        {toast ? (
          <div className="success-banner">
            <span>{toast}</span>
            <button type="button" onClick={() => setToast(undefined)}>
              关闭
            </button>
          </div>
        ) : null}
        {config.filters?.length ? (
          <FilterBar
            fields={config.filters}
            values={filters}
            onChange={(values) => setFiltersByEndpoint({ ...filtersByEndpoint, [endpoint]: values })}
          />
        ) : null}
        {query.error ? <ErrorBanner error={query.error} /> : null}
        {saveMutation.error ? <ErrorBanner error={saveMutation.error} /> : null}
        {actionMutation.error ? <ErrorBanner error={actionMutation.error} /> : null}
        <DataTable
          rows={query.data ?? []}
          loading={query.isLoading}
          preferredColumns={config.columns}
          onView={(row) => setDetailRow(row)}
          onEdit={(row) => setDrawer({ mode: 'edit', row })}
          actions={config.actions?.map((action, actionIndex) => ({
            label: action.label,
            tone: action.tone,
            onClick: (row) => actionMutation.mutate({ row, actionIndex }),
          }))}
        />
      </section>
      {drawer ? (
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
        <DetailDrawer row={detailRow} title="AI 记录详情" onClose={() => setDetailRow(undefined)} />
      ) : null}
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
  const [operationsTenant, setOperationsTenant] = useState<Record<string, unknown>>();
  const [featuresOpen, setFeaturesOpen] = useState(false);
  const [planFeaturesPlan, setPlanFeaturesPlan] = useState<Record<string, unknown>>();
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
          <div className="page-actions">
            {endpoint === '/admin/v1/plans' ? (
              <button className="ghost-button" type="button" onClick={() => setFeaturesOpen(true)}>
                功能项
              </button>
            ) : null}
            <button className="secondary-button" onClick={() => setDrawer({ mode: 'create' })}>
              新建
            </button>
          </div>
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
            endpoint === '/admin/v1/plans'
              ? [
                  {
                    label: '功能配置',
                    onClick: (row) => setPlanFeaturesPlan(row),
                  },
                ]
              : endpoint === '/admin/v1/tenants'
              ? [
                  {
                    label: '运营',
                    onClick: (row) => setOperationsTenant(row),
                  },
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
      {operationsTenant ? (
        <TenantOperationsDrawer
          tenant={operationsTenant}
          onClose={() => setOperationsTenant(undefined)}
        />
      ) : null}
      {featuresOpen ? (
        <FeatureManagementDrawer
          context={auth.activeContext}
          onClose={() => setFeaturesOpen(false)}
        />
      ) : null}
      {planFeaturesPlan ? (
        <PlanFeaturesDrawer
          plan={planFeaturesPlan}
          context={auth.activeContext}
          onClose={() => setPlanFeaturesPlan(undefined)}
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

function FeatureManagementDrawer({
  context,
  onClose,
}: {
  context?: { appId?: string; tenantId?: string | null };
  onClose(): void;
}) {
  const queryClient = useQueryClient();
  const config = resourceConfigs['/admin/v1/features'];
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [drawer, setDrawer] = useState<{
    mode: 'create' | 'edit';
    row?: Record<string, unknown>;
  }>();
  const [message, setMessage] = useState<string>();
  const features = useQuery({
    queryKey: ['billing-features', context, filters],
    queryFn: () => listResource<Record<string, unknown>>('/admin/v1/features', context, filters),
  });
  const saveFeature = useMutation({
    mutationFn: (values: Record<string, string>) => {
      const payload = config.transform ? config.transform(values, drawer?.mode ?? 'create') : compactValues(values);
      if (drawer?.mode === 'edit' && drawer.row?.id) {
        return updateResource(`/admin/v1/features/${String(drawer.row.id)}`, payload, context);
      }
      return createResource('/admin/v1/features', payload, context);
    },
    onSuccess: async () => {
      setDrawer(undefined);
      setMessage('功能项已保存');
      await queryClient.invalidateQueries({ queryKey: ['billing-features'] });
      await queryClient.invalidateQueries({ queryKey: ['tenant-operation-features'] });
    },
  });
  const actionMutation = useMutation({
    mutationFn: (input: { row: Record<string, unknown>; actionIndex: number }) => {
      const action = config.actions?.[input.actionIndex];
      if (!action) throw new Error('Unsupported action');
      if (!window.confirm(`确认执行“${action.label}”？`)) return Promise.resolve(undefined);
      return action.run(input.row, context);
    },
    onSuccess: async () => {
      setMessage('操作已完成');
      await queryClient.invalidateQueries({ queryKey: ['billing-features'] });
    },
  });

  return (
    <div className="drawer-backdrop">
      <aside className="drawer-panel wide-drawer">
        <div className="drawer-header">
          <div>
            <h2>功能项管理</h2>
            <p>维护可被套餐绑定和计量扣减的功能能力</p>
          </div>
          <button className="icon-button" onClick={onClose} type="button">
            ×
          </button>
        </div>
        <div className="members-content">
          {message ? (
            <div className="success-banner">
              <span>{message}</span>
              <button type="button" onClick={() => setMessage(undefined)}>
                关闭
              </button>
            </div>
          ) : null}
          <div className="drawer-toolbar">
            <FilterBar fields={config.filters ?? []} values={filters} onChange={setFilters} />
            <button className="secondary-button" type="button" onClick={() => setDrawer({ mode: 'create' })}>
              新建功能项
            </button>
          </div>
          {features.error ? <ErrorBanner error={features.error} /> : null}
          {saveFeature.error ? <ErrorBanner error={saveFeature.error} /> : null}
          {actionMutation.error ? <ErrorBanner error={actionMutation.error} /> : null}
          <DataTable
            rows={features.data ?? []}
            loading={features.isLoading}
            preferredColumns={config.columns}
            onView={undefined}
            onEdit={(row) => setDrawer({ mode: 'edit', row })}
            actions={config.actions?.map((action, actionIndex) => ({
              label: action.label,
              tone: action.tone,
              onClick: (row) => actionMutation.mutate({ row, actionIndex }),
            }))}
          />
        </div>
      </aside>
      {drawer ? (
        <ResourceDrawer
          config={config}
          mode={drawer.mode}
          row={drawer.row}
          saving={saveFeature.isPending}
          onClose={() => setDrawer(undefined)}
          onSubmit={(values) => saveFeature.mutate(values)}
        />
      ) : null}
    </div>
  );
}

function PlanFeaturesDrawer({
  plan,
  context,
  onClose,
}: {
  plan: Record<string, unknown>;
  context?: { appId?: string; tenantId?: string | null };
  onClose(): void;
}) {
  const queryClient = useQueryClient();
  const planId = String(plan.id);
  const [values, setValues] = useState<Record<string, string>>({
    featureId: '',
    enabled: 'true',
    quotaType: 'count',
    quotaLimit: '',
    resetCycle: 'monthly',
  });
  const [message, setMessage] = useState<string>();
  const features = useQuery({
    queryKey: ['plan-feature-options'],
    queryFn: () =>
      listResource<Record<string, unknown>>('/admin/v1/features', context, {
        status: 'active',
      }),
  });
  const planFeatures = useQuery({
    queryKey: ['plan-features', planId, context],
    queryFn: () => listResource<Record<string, unknown>>(`/admin/v1/plans/${planId}/features`, context),
  });
  const attachFeature = useMutation({
    mutationFn: () =>
      createResource(
        `/admin/v1/plans/${planId}/features`,
        {
          featureId: values.featureId,
          enabled: values.enabled === 'true',
          quotaType: values.quotaType || undefined,
          quotaLimit: values.quotaLimit ? Number(values.quotaLimit) : undefined,
          resetCycle: values.resetCycle || undefined,
        },
        context,
      ),
    onSuccess: async () => {
      setMessage('套餐功能配置已保存');
      setValues({
        featureId: '',
        enabled: 'true',
        quotaType: 'count',
        quotaLimit: '',
        resetCycle: 'monthly',
      });
      await queryClient.invalidateQueries({ queryKey: ['plan-features', planId] });
    },
  });
  const rows = (planFeatures.data ?? []).map((item) => {
    const feature = item.feature as Record<string, unknown> | undefined;
    return {
      ...item,
      featureKey: feature?.featureKey,
      featureName: feature?.name,
    };
  });

  return (
    <div className="drawer-backdrop">
      <aside className="drawer-panel wide-drawer">
        <div className="drawer-header">
          <div>
            <h2>套餐功能配置</h2>
            <p>{String(plan.name ?? planId)}</p>
          </div>
          <button className="icon-button" onClick={onClose} type="button">
            ×
          </button>
        </div>
        <div className="members-content">
          {message ? (
            <div className="success-banner">
              <span>{message}</span>
              <button type="button" onClick={() => setMessage(undefined)}>
                关闭
              </button>
            </div>
          ) : null}
          {attachFeature.error ? <ErrorBanner error={attachFeature.error} /> : null}
          <form
            className="inline-form plan-feature-form"
            onSubmit={(event) => {
              event.preventDefault();
              attachFeature.mutate();
            }}
          >
            <label>
              功能项
              <select
                required
                value={values.featureId}
                onChange={(event) => setValues({ ...values, featureId: event.target.value })}
              >
                <option value="">请选择</option>
                {(features.data ?? []).map((feature) => (
                  <option key={String(feature.id)} value={String(feature.id)}>
                    {String(feature.name ?? feature.featureKey)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              启用
              <select
                value={values.enabled}
                onChange={(event) => setValues({ ...values, enabled: event.target.value })}
              >
                <option value="true">启用</option>
                <option value="false">停用</option>
              </select>
            </label>
            <label>
              额度类型
              <input
                value={values.quotaType}
                onChange={(event) => setValues({ ...values, quotaType: event.target.value })}
                placeholder="count"
              />
            </label>
            <label>
              额度上限
              <input
                min="0"
                type="number"
                value={values.quotaLimit}
                onChange={(event) => setValues({ ...values, quotaLimit: event.target.value })}
              />
            </label>
            <label>
              重置周期
              <input
                value={values.resetCycle}
                onChange={(event) => setValues({ ...values, resetCycle: event.target.value })}
                placeholder="monthly"
              />
            </label>
            <button className="primary-button" type="submit" disabled={attachFeature.isPending}>
              {attachFeature.isPending ? '保存中' : '保存配置'}
            </button>
          </form>
          {planFeatures.error ? <ErrorBanner error={planFeatures.error} /> : null}
          <DataTable
            rows={rows}
            loading={planFeatures.isLoading}
            preferredColumns={['featureKey', 'featureName', 'enabled', 'quotaType', 'quotaLimit', 'resetCycle']}
            onEdit={(row) =>
              setValues({
                featureId: String(row.featureId ?? ''),
                enabled: row.enabled === false ? 'false' : 'true',
                quotaType: String(row.quotaType ?? ''),
                quotaLimit: row.quotaLimit === undefined || row.quotaLimit === null ? '' : String(row.quotaLimit),
                resetCycle: String(row.resetCycle ?? ''),
              })
            }
          />
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

function TenantOperationsDrawer({
  tenant,
  onClose,
}: {
  tenant: Record<string, unknown>;
  onClose(): void;
}) {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<(typeof tenantOperationTabs)[number]['key']>('subscriptions');
  const [subscriptionValues, setSubscriptionValues] = useState<Record<string, string>>({
    planId: '',
    months: '1',
  });
  const [usageValues, setUsageValues] = useState<Record<string, string>>({
    featureKey: '',
    metric: 'count',
    quantity: '1',
    sourceType: 'admin',
    sourceId: '',
    costAmount: '',
    chargeAmount: '',
  });
  const [entitlementValues, setEntitlementValues] = useState<Record<string, string>>({
    featureKey: '',
    metric: 'count',
    quantity: '1',
  });
  const [entitlementResult, setEntitlementResult] = useState<Record<string, unknown>>();
  const [message, setMessage] = useState<string>();
  const active = tenantOperationTabs.find((tab) => tab.key === activeTab) ?? tenantOperationTabs[0];
  const tenantId = String(tenant.id);
  const appId = tenant.appId === undefined || tenant.appId === null ? '' : String(tenant.appId);
  const scopedContext = { appId: appId || undefined, tenantId };
  const scopedFilters = compactValues({ appId, tenantId });
  const records = useQuery({
    queryKey: ['tenant-operations', tenantId, appId, active.key],
    queryFn: () => listResource<Record<string, unknown>>(active.endpoint, scopedContext, scopedFilters),
  });
  const plans = useQuery({
    queryKey: ['tenant-operation-plans', appId],
    queryFn: () =>
      listResource<Record<string, unknown>>('/admin/v1/plans', scopedContext, {
        appId,
        status: 'active',
      }),
    enabled: Boolean(appId),
  });
  const features = useQuery({
    queryKey: ['tenant-operation-features'],
    queryFn: () =>
      listResource<Record<string, unknown>>('/admin/v1/features', scopedContext, {
        status: 'active',
      }),
  });
  const openSubscription = useMutation({
    mutationFn: () =>
      createResource(
        '/admin/v1/subscriptions/open',
        {
          tenantId,
          planId: subscriptionValues.planId,
          months: Number(subscriptionValues.months || 1),
        },
        scopedContext,
      ),
    onSuccess: async () => {
      setMessage('订阅已开通，额度已按套餐初始化');
      await queryClient.invalidateQueries({ queryKey: ['tenant-operations', tenantId, appId] });
      await queryClient.invalidateQueries({ queryKey: ['resource', '/admin/v1/tenants'] });
    },
  });
  const recordUsage = useMutation({
    mutationFn: () =>
      createResource(
        '/admin/v1/usage/ledger',
        {
          appId,
          tenantId,
          featureKey: usageValues.featureKey,
          metric: usageValues.metric || 'count',
          quantity: Number(usageValues.quantity || 1),
          sourceType: usageValues.sourceType || undefined,
          sourceId: usageValues.sourceId || undefined,
          costAmount: usageValues.costAmount ? Number(usageValues.costAmount) : undefined,
          chargeAmount: usageValues.chargeAmount ? Number(usageValues.chargeAmount) : undefined,
        },
        scopedContext,
      ),
    onSuccess: async () => {
      setMessage('用量已记录，匹配周期内的额度已同步扣减');
      setUsageValues({
        featureKey: '',
        metric: 'count',
        quantity: '1',
        sourceType: 'admin',
        sourceId: '',
        costAmount: '',
        chargeAmount: '',
      });
      await queryClient.invalidateQueries({ queryKey: ['tenant-operations', tenantId, appId] });
    },
  });
  const checkEntitlement = useMutation({
    mutationFn: () =>
      createResource<Record<string, unknown>>(
        '/admin/v1/usage/entitlements/check',
        {
          tenantId,
          featureKey: entitlementValues.featureKey,
          metric: entitlementValues.metric || undefined,
          quantity: Number(entitlementValues.quantity || 1),
        },
        scopedContext,
      ),
    onSuccess: (result) => {
      setEntitlementResult(result);
      setMessage(result.allowed ? '权益检查通过' : '权益检查未通过');
    },
  });

  return (
    <div className="drawer-backdrop">
      <aside className="drawer-panel wide-drawer">
        <div className="drawer-header">
          <div>
            <h2>租户运营</h2>
            <p>{String(tenant.name ?? tenantId)}</p>
          </div>
          <button className="icon-button" onClick={onClose} type="button">
            ×
          </button>
        </div>
        <div className="members-content">
          <div className="tab-list" role="tablist" aria-label="租户运营数据">
            {tenantOperationTabs.map((tab) => (
              <button
                key={tab.key}
                type="button"
                role="tab"
                aria-selected={activeTab === tab.key}
                className={activeTab === tab.key ? 'tab-button active' : 'tab-button'}
                onClick={() => setActiveTab(tab.key)}
              >
                {tab.label}
              </button>
            ))}
          </div>
          {message ? (
            <div className="success-banner">
              <span>{message}</span>
              <button type="button" onClick={() => setMessage(undefined)}>
                关闭
              </button>
            </div>
          ) : null}
          {openSubscription.error ? <ErrorBanner error={openSubscription.error} /> : null}
          {recordUsage.error ? <ErrorBanner error={recordUsage.error} /> : null}
          {checkEntitlement.error ? <ErrorBanner error={checkEntitlement.error} /> : null}
          {active.key === 'subscriptions' ? (
            <form
              className="inline-form operation-form"
              onSubmit={(event) => {
                event.preventDefault();
                if (!window.confirm('确认为该租户开通所选套餐？')) return;
                openSubscription.mutate();
              }}
            >
              <label>
                套餐
                <select
                  required
                  value={subscriptionValues.planId}
                  onChange={(event) =>
                    setSubscriptionValues({ ...subscriptionValues, planId: event.target.value })
                  }
                >
                  <option value="">请选择</option>
                  {(plans.data ?? []).map((plan) => (
                    <option key={String(plan.id)} value={String(plan.id)}>
                      {String(plan.name ?? plan.id)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                月数
                <input
                  required
                  min="1"
                  type="number"
                  value={subscriptionValues.months}
                  onChange={(event) =>
                    setSubscriptionValues({ ...subscriptionValues, months: event.target.value })
                  }
                />
              </label>
              <button className="primary-button" type="submit" disabled={openSubscription.isPending}>
                {openSubscription.isPending ? '开通中' : '开通订阅'}
              </button>
            </form>
          ) : null}
          {active.key === 'ledger' ? (
            <form
              className="inline-form operation-form usage-form"
              onSubmit={(event) => {
                event.preventDefault();
                recordUsage.mutate();
              }}
            >
              <label>
                功能
                <select
                  required
                  value={usageValues.featureKey}
                  onChange={(event) => setUsageValues({ ...usageValues, featureKey: event.target.value })}
                >
                  <option value="">请选择</option>
                  {(features.data ?? []).map((feature) => (
                    <option key={String(feature.id)} value={String(feature.featureKey)}>
                      {String(feature.name ?? feature.featureKey)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                指标
                <input
                  required
                  value={usageValues.metric}
                  onChange={(event) => setUsageValues({ ...usageValues, metric: event.target.value })}
                />
              </label>
              <label>
                数量
                <input
                  required
                  min="1"
                  type="number"
                  value={usageValues.quantity}
                  onChange={(event) => setUsageValues({ ...usageValues, quantity: event.target.value })}
                />
              </label>
              <label>
                来源
                <input
                  value={usageValues.sourceType}
                  onChange={(event) => setUsageValues({ ...usageValues, sourceType: event.target.value })}
                />
              </label>
              <label>
                来源 ID
                <input
                  value={usageValues.sourceId}
                  onChange={(event) => setUsageValues({ ...usageValues, sourceId: event.target.value })}
                />
              </label>
              <button className="primary-button" type="submit" disabled={recordUsage.isPending}>
                {recordUsage.isPending ? '记录中' : '记录用量'}
              </button>
            </form>
          ) : null}
          {active.key === 'quotas' ? (
            <>
              <form
                className="inline-form operation-form quota-check-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  checkEntitlement.mutate();
                }}
              >
                <label>
                  功能
                  <select
                    required
                    value={entitlementValues.featureKey}
                    onChange={(event) =>
                      setEntitlementValues({ ...entitlementValues, featureKey: event.target.value })
                    }
                  >
                    <option value="">请选择</option>
                    {(features.data ?? []).map((feature) => (
                      <option key={String(feature.id)} value={String(feature.featureKey)}>
                        {String(feature.name ?? feature.featureKey)}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  指标
                  <input
                    value={entitlementValues.metric}
                    onChange={(event) =>
                      setEntitlementValues({ ...entitlementValues, metric: event.target.value })
                    }
                  />
                </label>
                <label>
                  数量
                  <input
                    required
                    min="1"
                    type="number"
                    value={entitlementValues.quantity}
                    onChange={(event) =>
                      setEntitlementValues({ ...entitlementValues, quantity: event.target.value })
                    }
                  />
                </label>
                <button className="primary-button" type="submit" disabled={checkEntitlement.isPending}>
                  {checkEntitlement.isPending ? '检查中' : '检查权益'}
                </button>
              </form>
              {entitlementResult ? (
                <div className="operation-result">
                  {Object.entries(entitlementResult).map(([key, value]) => (
                    <div className="detail-row" key={key}>
                      <span>{columnLabels[key] ?? key}</span>
                      <strong>{formatCell(value)}</strong>
                    </div>
                  ))}
                </div>
              ) : null}
            </>
          ) : null}
          {records.error ? <ErrorBanner error={records.error} /> : null}
          <DataTable
            rows={records.data ?? []}
            loading={records.isLoading}
            preferredColumns={[...active.columns]}
            onView={undefined}
          />
        </div>
      </aside>
    </div>
  );
}

function initialValues(config: ResourceConfig, row?: Record<string, unknown>) {
  const values: Record<string, string> = {};
  for (const field of config.fields) {
    if (!row && field.defaultValue !== undefined) {
      values[field.key] = field.defaultValue;
    } else if (field.key === 'valueText') {
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
  if (typeof value === 'boolean') return value ? '是' : '否';
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
