# 项目功能与开源定位

## 1. 项目一句话定位

AI SaaS Admin 是一套面向多租户 AI SaaS 产品的开源后端底座，目标是把应用管理、租户管理、权限、套餐计费、AI 网关、Prompt、知识库/RAG、开放 API、Webhook、用量统计和审计日志统一到一套可复用系统里。

它不是普通后台模板，也不是单一业务系统，而是一个可以支撑多个 AI SaaS 项目的通用控制台和运行网关。

## 2. 为什么需要这套系统

很多 AI SaaS 项目都会重复建设同一批能力：

- 登录和账号体系
- 多租户隔离
- App / Tenant / User / Role / Permission
- 套餐、订阅、订单、支付
- AI 服务商、模型、路由
- Prompt 版本管理
- 知识库、文件解析、向量检索、RAG
- API Key、Webhook、开放 API
- 用量、额度、成本、日志、审计

这些能力如果散落在每个业务项目里，会导致：

- 权限和租户隔离容易出错
- AI 成本无法统一治理
- Prompt 版本不可追踪
- 用量计费难以对账
- 知识库和文件资产无法复用
- 每个新 SaaS 项目都要重复造轮子

本项目的目标就是把这些通用能力沉淀成一套开源底座，让后续业务 App 可以专注在自己的业务逻辑上。

## 3. 三个核心平面

### 3.1 控制面 Control Plane

控制面面向平台管理员和租户管理员，负责配置和治理。

包含：

- 应用管理
- 租户管理
- 用户与成员管理
- 角色权限
- 菜单权限
- 套餐与权益配置
- AI Provider / Model / Route 配置
- Prompt 管理
- 知识库管理
- 系统设置
- 审计日志

### 3.2 运行面 Runtime Plane

运行面面向业务系统、外部开发者和用户端 API 调用。

包含：

- Open API 鉴权
- API Key scope 校验
- AI chat / generate 调用
- Prompt 渲染
- 模型路由
- 权益和额度检查
- 用量流水记录
- RAG 查询
- Webhook 投递

### 3.3 数据面 Data Plane

数据面负责沉淀长期资产和运行数据。

包含：

- 租户数据
- 订阅、订单、支付流水
- 用量流水和 quota bucket
- AI 调用日志
- Prompt 版本
- 文件资产
- 知识库、chunk、embedding vector
- RAG 查询日志
- 任务记录
- 审计日志
- 运营指标

## 4. 当前已经实现的能力

| 模块 | 状态 | 说明 |
|---|---|---|
| Auth | 已实现主链路 | 登录、JWT、当前用户、上下文切换、菜单 |
| Tenant Context | 已实现 | 支持 app/tenant 上下文解析和非平台用户隔离 |
| RBAC | 已实现 | 权限点、角色、菜单、PermissionGuard |
| Audit | 基础实现 | 写操作、安全事件、权限拒绝记录 |
| App Center | 基础实现 | 应用 CRUD 和禁用 |
| Tenancy | 基础实现 | 租户、审核、成员、角色初始化、owner 绑定 |
| Identity | 基础实现 | 用户列表、详情、创建、更新 |
| Billing | 主链路实现 | 功能、套餐、订阅、订单、支付回调、幂等 |
| Usage | 主链路实现 | 用量流水、额度桶、权益检查 |
| AI Center | 主链路实现 | provider、model、route、Prompt、Open AI 调用、日志 |
| Knowledge/RAG | 主链路实现 | 知识库、PDF/DOCX 解析、pgvector、RAG query |
| Developer | 主链路实现 | API Key、scope、Webhook、delivery、retry |
| Tasks | 基础实现 | 异步任务记录 |
| System | 基础实现 | settings、dict items |
| Dashboard | 极简实现 | summary 计数 |

当前后端已经能跑通两条重要闭环：

- 支付闭环：创建订单、支付回调验签、订单支付、订阅开通、额度创建、重复回调幂等。
- 知识库闭环：创建知识库、解析 PDF/DOCX、写入 chunk/vector、执行 RAG 查询。

## 5. 当前还没有完成的能力

### 5.1 后端产品化缺口

- Refresh Token、退出登录、修改密码、找回密码。
- 登录限流、失败锁定、安全响应头、CORS 白名单。
- 真实支付发起、退款、续费、取消订阅、到期扫描。
- AI fallback 真正执行、流式响应、更多模型能力适配。
- Prompt 测试运行、回滚、diff。
- 文件上传 API、知识库文件列表、chunk 管理、RAG 日志。
- API Key 轮换、Webhook 更新/禁用/测试发送。
- 任务详情、任务取消、任务重试。
- 审计详情、审计导出。
- Dashboard 趋势、成本、收入、异常告警。
- Notification、DailyMetric、EventOutbox、RagConfig、PromptTestRun 等模型的完整 API。

### 5.2 管理端 UI 缺口

当前仓库是后端工程，还没有管理端前端工程。后续需要创建管理端 UI，建议目录为：

```text
apps/admin-web
```

推荐技术栈：

```text
React
Vite
TypeScript
TanStack Query
React Router
Tailwind CSS
shadcn/ui
lucide-react
```

## 6. 管理端 UI 应覆盖的主要页面

### 6.1 平台管理员

```text
Dashboard
App Center
Tenant Center
Identity / Users
Permission / Roles / Permissions
Billing / Features / Plans / Subscriptions / Orders / Usage / Quotas
AI Center / Providers / Models / Routes / Prompts / Call Logs
Knowledge / Bases / Files / Chunks / RAG Logs
Developer / API Keys / Webhooks
Tasks
System / Settings / Dict Items / Audit Logs
```

### 6.2 租户管理员

```text
Dashboard
Tenant Profile
Members
Billing / Plans / Orders / Subscription / Usage
AI / Prompts / Call Logs
Knowledge / Knowledge Bases
Developer / API Keys / Webhooks
Tasks
Audit Logs
```

### 6.3 UI 设计原则

- 做真实后台工具，不做营销落地页。
- 优先信息密度和可扫描性。
- 使用左侧导航、顶部上下文切换、内容区表格/详情/抽屉。
- 不做大面积装饰渐变，不做卡片套卡片。
- 表格、筛选、抽屉表单、确认弹窗是主要交互。
- 图标使用 lucide。
- 卡片和按钮圆角控制在 6-8px。
- 状态颜色保持一致：成功绿、失败红、警告黄、处理中蓝、禁用灰。

## 7. 开源定位

本项目计划作为开源项目发布到 GitHub。推荐定位为：

```text
Open-source backend foundation for multi-tenant AI SaaS platforms.
```

中文定位：

```text
面向多租户 AI SaaS 的开源后端底座。
```

适合的开源受众：

- 正在做 AI SaaS 的个人开发者。
- 需要多租户后台的团队。
- 想统一管理 AI Provider、Prompt、知识库和用量的项目。
- 想基于 NestJS + Prisma + PostgreSQL + pgvector 搭建 AI 平台底座的人。

## 8. 开源原则

### 8.1 Provider Neutral

系统不绑定某一家模型供应商。DeepSeek、MiniMax、OpenAI-compatible provider 都应该通过统一 provider/route 配置接入。

### 8.2 Secrets Never in Repo

真实密钥不进入 GitHub。

只允许提交：

```text
.env.example
secretRef: env:PROVIDER_API_KEY
```

禁止提交：

```text
.env
真实 API Key
支付密钥
对象存储真实密钥
JWT 生产密钥
Webhook secret
```

如果本地曾经使用过测试 key，发布公开仓库前建议轮换这些 key。

### 8.3 Backend First, UI Follows

后端先保证边界、权限、计费、AI、知识库主链路稳定。UI 按 `docs/DEVELOPMENT_WORKFLOW.md` 的阶段推进。

### 8.4 Modular Monolith First

第一版保持模块化单体，不急着拆微服务。后续可以按 AI、Knowledge、Billing、Developer 等模块逐步拆分。

## 9. GitHub 发布前检查清单

发布前必须检查：

- `.env` 未被提交。
- `node_modules` 未被提交。
- `dist` 未被提交。
- 日志文件未被提交。
- README 不包含真实密钥。
- 文档不包含真实密钥。
- `.env.example` 只使用占位符或本地开发默认值。
- 已选择开源许可证，例如 MIT 或 Apache-2.0。
- GitHub repo description 写清楚项目定位。
- 首个 release 标记为 MVP 或 alpha，不承诺生产可直接使用。

推荐 GitHub 描述：

```text
Open-source backend foundation for multi-tenant AI SaaS platforms: auth, RBAC, billing, AI gateway, PromptOps, RAG, API keys, webhooks, usage and audit.
```

## 10. 推荐下一步

下一步开发建议按这个顺序推进：

1. 补 `GET /health`、统一错误结构、request id。
2. 补 AI route 列表、详情、更新、禁用。
3. 补知识库详情、文件列表、chunk 列表、RAG log。
4. 补订单、订阅、任务详情接口。
5. 创建 `apps/admin-web` 管理端前端工程。
6. 先做登录、菜单、上下文切换、租户列表、套餐列表、知识库列表。

完整开发流程见：

```text
docs/DEVELOPMENT_WORKFLOW.md
```
