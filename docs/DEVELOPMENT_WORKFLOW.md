# AI SaaS Admin 开发流程与 UI 设计

本文基于当前代码库检查结果整理，目标是把剩余工作变成可持续推进的开发流程。当前仓库是后端工程，还没有管理端前端工程；因此 UI 部分先作为产品与交互规格，后续可以据此创建独立 `admin-web` 或同仓 `apps/admin-web` 前端项目。

## 1. 当前项目判断

### 1.1 已经完成的后端能力

| 模块 | 当前状态 | 说明 |
|---|---|---|
| Auth | 已成型 | 登录、JWT、当前用户、上下文切换、菜单获取 |
| Tenant Context | 已成型 | `TenantContextInterceptor` 解析 `x-app-id/x-tenant-id`、activeContext、membership |
| RBAC | 已成型 | `PermissionGuard`、`@RequirePermissions()`、角色权限种子 |
| Audit | 基础可用 | 写操作审计、登录/切换/拒绝等安全事件 |
| App Center | 基础 CRUD | 应用列表、详情、创建、更新、禁用 |
| Tenancy | 基础闭环 | 租户、审核、成员、租户角色初始化、owner 绑定 |
| Identity | 基础可用 | 用户列表、详情、创建、更新，读写已接入租户访问保护 |
| Billing | 主链路可用 | 功能、套餐、套餐权益、订阅、订单、支付回调、幂等 |
| Usage | 主链路可用 | ledger、quota、entitlement check |
| AI Center | 主链路可用 | provider/model/route、prompt、open AI 调用、call log、usage |
| Knowledge/RAG | 主链路可用 | 知识库、文件解析任务、PDF/DOCX、pgvector、RAG query |
| Developer | 主链路可用 | API Key hash 存储、scope、Webhook、delivery、retry |
| Tasks | 基础可用 | 异步任务记录列表和创建 |
| System | 基础可用 | settings、dict items |
| Dashboard | 极简可用 | summary 计数 |
| E2E | 部分覆盖 | payment、knowledge 两条核心链路 |

### 1.2 当前明显未完成或不够产品化的部分

| 分类 | 缺口 | 风险/影响 |
|---|---|---|
| 前端 | 没有管理端 UI 工程 | 后端可用但无法形成可交付产品 |
| Auth | 没有 refresh token、退出登录、修改密码、找回密码 | 生产账号体系不完整 |
| 安全 | 没有限流、登录失败锁定、CORS 白名单、helmet、安全响应头 | 开放环境风险高 |
| 数据模型 | `Notification`、`DailyMetric`、`Tag`、`EventOutbox`、`RagConfig`、`PromptTestRun` 有表但无完整 API | 已设计但未产品化 |
| Billing | 没有真实支付发起适配器、退款、取消订阅、续费、到期任务 | 只能验证回调闭环，不能真实收款 |
| AI | Provider adapter 只覆盖 OpenAI-compatible chat/completions；没有真正 fallback 调用、流式响应、图像/embedding 通用适配 | AI Gateway 仍是 MVP 级 |
| Prompt | 有版本发布，但缺测试运行、回滚、diff、变量表单化 | PromptOps 不够完整 |
| Knowledge | 没有真实文件上传 API、文件列表/删除、知识库详情、chunk 管理、引用详情接口 | UI 难做完整知识库管理 |
| Developer | Webhook 没有禁用、更新、测试发送；API Key 没有详情/轮换 | 开发者中心不完整 |
| Tasks | 只能列表/创建；缺详情、取消、重试、任务类型视图 | 运维排障不足 |
| Audit | 没有详情和导出；审计 before/after 不完整 | 合规与问题追踪不足 |
| Dashboard | 只有计数，没有趋势、成本、用量、转化、异常 | 运营价值不足 |
| Observability | 没有结构化日志、请求 ID、健康检查、metrics、队列告警 | 生产运维困难 |
| Testing | 缺单元测试、权限矩阵测试、API contract test、UI e2e | 回归风险偏高 |
| 文档 | API 合同已有，但缺 UI 合同、错误码、状态机、部署 runbook | 团队协作信息不足 |

## 2. 推荐总体开发顺序

不要从视觉炫酷的仪表盘开始。这个项目真正的产品价值是多租户、计费、AI 网关、知识库和用量治理。推荐按以下 7 个阶段推进。

### 阶段 0: 项目卫生与工程基线

目标：让后端和未来前端都有稳定开发基线。

当前进度：已完成 `GET /health`、全局 `x-request-id`、统一错误响应结构、
Swagger 品牌信息、`x-powered-by` 隐藏，以及 `CORS_ORIGINS` 白名单配置。剩余
P0 工作集中在限流、helmet/body size limit、结构化日志与更多 contract tests。

后端任务：
- 增加 `GET /health`，检查 Postgres、Redis、队列、MinIO。
- 增加统一错误码结构：`code/message/details/requestId`。
- 增加 request id middleware，并写入日志和审计。
- 增加生产安全配置：helmet、CORS 白名单、body size limit。
- 增加限流：登录、Open API、Webhook、文件解析入口。
- 增加 `.env.example` 分组注释和生产必填说明。

前端任务：
- 创建管理端工程，建议 `apps/admin-web`。
- 技术栈建议：React + Vite + TypeScript + TanStack Query + React Router + Tailwind CSS + shadcn/ui + lucide-react。
- 建立 API client：统一 token、错误处理、分页、空状态、权限判断。

验收：
- `npm run build`
- `npm run lint`
- `npm run test:payment`
- `npm run test:knowledge`
- 前端能登录并显示菜单骨架。

### 阶段 1: 管理端壳与基础权限 UI

目标：平台管理员和租户管理员能进入系统、切换上下文、看到正确菜单和基础数据。

后端补齐：
- `GET /auth/me` 返回更适合 UI 的用户摘要、activeContext、roles、permissions。
- `POST /auth/logout`。
- `POST /auth/change-password`。
- 可选：refresh token 和 token rotate。

UI 页面：
- 登录页 `/login`
- 控制台布局 `/`
- 上下文切换器：App/Tenant 切换
- 个人菜单：当前用户、修改密码、退出
- 菜单权限驱动的侧边栏
- 403/404/500 页面

UI 设计要求：
- 后台工具风格，信息密度高，避免营销式大卡片。
- 左侧 240px 导航，顶部 56px 工具栏，内容区最大不做卡片套卡片。
- 表格、筛选、抽屉表单、确认弹窗是主要交互模式。
- 卡片半径不超过 8px。
- 图标使用 lucide，不手写装饰 SVG。

验收：
- 不同角色登录后菜单不同。
- 租户用户无法看到平台级入口。
- 上下文切换后列表数据随之变化。

### 阶段 2: 平台基础运营 UI

目标：把 App、Tenant、User、Role、System 这些底座做成可操作后台。

后端补齐：
- 用户禁用/启用。
- 角色详情、角色菜单绑定接口。
- 权限列表按模块分组。
- 审计详情接口。
- 系统设置按 scope 分组。

UI 页面与路由：
- `/apps` 应用列表、创建、编辑、禁用。
- `/tenants` 租户列表、详情、审核、禁用。
- `/tenants/:id/members` 成员列表、添加、改角色、禁用。
- `/users` 用户列表、详情、更新、禁用。
- `/permission/roles` 角色列表、创建、授权、菜单绑定。
- `/system/settings` 设置管理。
- `/system/dict-items` 字典管理。
- `/system/audit-logs` 审计日志。

关键交互：
- 租户详情采用 Tabs：概览、成员、角色、订阅、订单、用量、知识库、审计。
- 角色授权用模块化 checkbox tree。
- 审计日志详情用 diff 视图显示 after/before。

验收：
- 平台管理员能完整创建 App -> Tenant -> Owner。
- 租户 owner 只能管理自己租户成员。
- 所有写操作有审计记录。

### 阶段 3: 商业化与用量 UI

目标：形成从套餐配置、下单、支付、订阅、额度到用量可视化的闭环。

后端补齐：
- 套餐详情、套餐更新、套餐禁用。
- 订单详情、订单取消。
- 订阅取消、续费、到期扫描任务。
- 支付发起适配器：mock、wechat、alipay 或 stripe 选一条先做完整。
- 支付交易列表和详情。
- 用量聚合 API：按天、按功能、按租户。
- quota 调整接口。

UI 页面：
- `/billing/features` 功能管理。
- `/billing/plans` 套餐管理，含权益配置。
- `/billing/orders` 订单列表、详情。
- `/billing/subscriptions` 订阅列表、开通、取消、续费。
- `/billing/usage` 用量流水。
- `/billing/quotas` 额度桶与调整。
- 租户侧 `/tenant/orders` 套餐购买、订单支付状态。

关键 UI 设计：
- 套餐详情使用左右布局：左侧套餐基本信息，右侧权益表格。
- 权益配置用可编辑表格：功能、启用、额度类型、额度值、重置周期。
- 订单状态颜色：pending 灰、paid 绿、failed 红、refunded 蓝灰、cancelled 灰。
- 用量页优先提供筛选和趋势，不做大面积装饰。

验收：
- 租户购买套餐后自动开通订阅并创建 quota。
- 重复支付回调幂等。
- 超额后 Open API 被拒绝或返回 quota exceeded。

### 阶段 4: AI Center 与 PromptOps UI

目标：让平台可以配置模型，租户可以管理 Prompt，并能观察 AI 调用成本。

后端补齐：
- Provider 更新、禁用前依赖提示。
- Model 更新、禁用。
- Route 列表、详情、更新、禁用。
- 真正 fallback 调用：主模型失败后尝试 fallback 模型并记录。
- OpenAI-compatible embedding/generate/chat 适配统一化。
- Prompt test run：`POST /admin/v1/prompts/:id/test`。
- Prompt rollback：`POST /admin/v1/prompts/:id/rollback`。
- AI streaming 可选：SSE 或 fetch stream。
- 成本计算按 provider/model 单价落账。

UI 页面：
- `/ai/providers`
- `/ai/models`
- `/ai/routes`
- `/ai/prompts`
- `/ai/prompts/:id`
- `/ai/calls`

Prompt 编辑器设计：
- 三栏布局：版本列表、编辑区、测试区。
- 编辑区支持变量提示 `{{variable}}`。
- 测试区展示输入变量、模型响应、token、耗时、错误。
- 发布必须二次确认，显示当前版本和目标版本。
- 版本 diff 用左右对比或 inline diff。

AI 调用日志设计：
- 筛选：时间、租户、routeKey、provider、model、status。
- 表格列：时间、租户、route、model、tokens、cost、latency、status。
- 详情抽屉：请求摘要、响应摘要、错误、raw usage。

验收：
- 能配置 DeepSeek/MiniMax/OpenAI-compatible provider。
- Prompt 发布后 Open API `promptKey` 走新版本。
- 失败调用能看到错误和成本为 0 或估算值。

### 阶段 5: Knowledge/RAG 产品化 UI

目标：租户能上传资料、查看解析状态、执行 RAG 查询并追踪来源。

后端补齐：
- 文件上传到 MinIO 的 API：multipart 或 presigned upload。
- 知识库详情、更新、禁用/删除。
- 知识库文件列表、文件删除、重新解析。
- chunk 列表、chunk 搜索、chunk 删除或禁用。
- RAG query log 列表和详情。
- RagConfig CRUD：topK、scoreThreshold、rerank、是否引用公共库。
- 引用来源结构化返回：chunkId、fileName、score、content snippet。
- legacy DOC 解析可以暂缓，但要在 UI 明确不支持。

UI 页面：
- `/knowledge/bases`
- `/knowledge/bases/:id`
- `/knowledge/bases/:id/files`
- `/knowledge/bases/:id/chunks`
- `/knowledge/bases/:id/playground`
- `/knowledge/rag-logs`

关键 UI 设计：
- 知识库详情 Tabs：概览、文件、Chunks、检索测试、配置、日志。
- 文件上传用拖拽区，上传后进入任务状态列表。
- 文件状态：pending、running、succeeded、failed。
- 检索测试页面左侧输入 query，右侧显示答案/匹配 chunks/score/来源。
- Chunk 内容不要塞进表格，表格展示摘要，详情用抽屉。

验收：
- PDF/DOCX 上传后可解析并检索。
- 租户只能查自己的知识库。
- 解析失败能在任务和文件状态中看到原因。

### 阶段 6: Developer Platform UI

目标：租户能自助创建 API Key、配置 Webhook、查看调用文档和投递记录。

后端补齐：
- API Key 详情、轮换、更新名称、更新 scope。
- Webhook 更新、禁用、测试发送。
- Webhook delivery 详情。
- Open API usage 文档 endpoint 可选。
- API Key 创建后只显示一次密钥，前端要明确。

UI 页面：
- `/developer/api-keys`
- `/developer/webhooks`
- `/developer/webhooks/:id/deliveries`
- `/developer/docs`

关键 UI 设计：
- API Key 创建成功弹窗只显示一次完整 key，之后只展示 prefix。
- scope 使用 checkbox group，按 `ai`、`rag`、`knowledge` 分组。
- Webhook delivery 详情展示 headers、payload、response、重试按钮。

验收：
- 租户 A 不能查看、禁用、重试租户 B 的 Webhook/API Key。
- Webhook 签名可被外部样例验证。

### 阶段 7: 运营分析、通知与生产化

目标：系统具备可运营、可告警、可恢复能力。

后端补齐：
- `DailyMetric` 聚合任务。
- Dashboard 趋势 API：收入、订单、AI tokens、成本、RAG 查询、活跃租户。
- `Notification` API：列表、已读、未读数。
- `EventOutbox` 处理器：关键事件异步化。
- 队列失败告警：任务失败、Webhook 多次失败、支付异常、AI 成本异常。
- 备份与恢复 runbook。

UI 页面：
- `/dashboard`
- `/tasks`
- `/notifications`
- `/analytics/ai`
- `/analytics/billing`
- `/analytics/knowledge`

Dashboard 设计：
- 第一屏是紧凑运营台：收入、活跃租户、AI 成本、失败任务、Webhook 失败、支付异常。
- 趋势图选择 7/30/90 天。
- 异常列表可点击跳转到任务、订单、AI call、Webhook delivery。

验收：
- 每日指标可以重算。
- 异常任务有明确入口处理。
- 关键数据可导出。

## 3. 管理端 UI 信息架构

### 3.1 平台管理员菜单

```text
Dashboard
App Center
Tenant Center
Identity
  Users
Permission
  Roles
  Permissions
Billing
  Features
  Plans
  Subscriptions
  Orders
  Usage
  Quotas
AI Center
  Providers
  Models
  Routes
  Prompts
  Call Logs
Knowledge
  Knowledge Bases
  RAG Logs
Developer
  API Keys
  Webhooks
Tasks
System
  Settings
  Dict Items
  Audit Logs
```

### 3.2 租户管理员菜单

```text
Dashboard
Tenant
  Profile
  Members
Billing
  Plans
  Orders
  Subscription
  Usage
AI
  Prompts
  Call Logs
Knowledge
  Knowledge Bases
Developer
  API Keys
  Webhooks
Tasks
Audit Logs
```

### 3.3 页面通用模式

| 页面类型 | UI 模式 |
|---|---|
| 列表页 | 顶部筛选栏 + 表格 + 分页 + 批量操作 |
| 详情页 | 顶部摘要 + Tabs + 右侧危险操作区 |
| 创建/编辑 | 抽屉表单优先；复杂对象用独立页面 |
| 状态变更 | 二次确认弹窗，危险操作需要输入名称确认 |
| 日志详情 | 抽屉展示 JSON、错误、上下文、关联资源 |
| 测试/Playground | 左输入、右输出，底部展示 logs/usage/source |

### 3.4 视觉规范

- 主色：中性蓝或青蓝，避免整站紫色渐变。
- 背景：`#f8fafc` 或接近白色，内容区以边线和分组区分。
- 字体：系统无衬线；数字使用 tabular nums。
- 圆角：按钮、输入、卡片 6-8px。
- 图标：lucide-react。
- 表格密度：默认紧凑，可提供 comfortable 开关。
- 状态色：成功绿、失败红、警告黄、处理中蓝、禁用灰。
- 不做大面积 hero，不做装饰性渐变球。

## 4. API 优先级补全清单

### P0 必须先补

- `GET /health`
- `POST /auth/logout`
- `POST /auth/change-password`
- `GET /admin/v1/ai/routes`
- `PATCH /admin/v1/ai/routes/:id`
- `POST /admin/v1/ai/routes/:id/disable`
- `GET /admin/v1/knowledge-bases/:id`
- `GET /admin/v1/knowledge-bases/:id/files`
- `GET /admin/v1/knowledge-bases/:id/chunks`
- `GET /admin/v1/orders/:id`
- `GET /admin/v1/subscriptions/:id`
- `GET /admin/v1/tasks/:id`
- `POST /admin/v1/tasks/:id/retry`

### P1 产品化补齐

- Prompt test、rollback、diff。
- API Key update/rotate。
- Webhook update/disable/test。
- Plan update/disable。
- Subscription cancel/renew。
- Payment provider create session。
- Knowledge upload/presigned URL。
- RAG logs list/detail。
- Notification list/read.

### P2 运营增强

- DailyMetric 聚合。
- Dashboard 趋势。
- 报表导出。
- 告警任务。
- EventOutbox processor。
- 成本异常检测。

## 5. 测试流程

每个阶段必须保留这几类测试：

```text
npm run build
npx tsc --noEmit -p tsconfig.json
npm run lint
npm run test:payment
npm run test:knowledge
```

新增测试建议：

- `test:auth`：登录、切换上下文、菜单、密码修改。
- `test:tenant-scope`：跨租户读写矩阵。
- `test:ai`：mock OpenAI-compatible provider、promptKey、fallback、usage。
- `test:developer`：API Key scope、Webhook 签名、retry。
- `test:ui`：Playwright 覆盖登录、列表筛选、创建租户、创建知识库、购买套餐。

## 6. 每轮开发执行节奏

后续每次推进按这个顺序走：

1. 选一个 P0/P1 闭环，不跨太多模块。
2. 先补 API 合同和 DTO。
3. 实现 service/controller。
4. 接入 RBAC、tenant scope、audit。
5. 更新 seed 权限和菜单。
6. 写或扩展 e2e 脚本。
7. 更新 README/API_CONTRACT/本流程文档。
8. 跑 build、tsc、lint、相关 e2e。
9. 若涉及 UI，启动前端 dev server，用浏览器检查桌面和移动宽度。

## 7. 下一步建议

最合理的下一步不是直接做所有 UI，而是先补前端需要的关键后端接口：

1. 补 AI routes 的列表、详情、更新、禁用。
2. 补知识库详情、文件列表、chunk 列表、RAG log 列表。
3. 补订单/订阅/任务详情。
4. 创建 `apps/admin-web` 前端工程和基础布局。
5. 先做登录、菜单、上下文切换、租户列表、套餐列表、知识库列表这 5 个页面。

这样后端 API 和 UI 可以并行收敛，避免先做一堆静态页面。
