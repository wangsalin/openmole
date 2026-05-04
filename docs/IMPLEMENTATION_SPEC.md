# 开发实施规格

## 1. 当前状态

当前已经从原始方案补成一个可开发后端工程：

- `docker-compose.yml`：PostgreSQL、Redis、MinIO
- `prisma/schema.prisma`：第一版核心表模型
- `prisma/seed.ts`：默认 App、超级管理员、基础权限、基础功能
- `src/modules/*`：按业务域拆分的 NestJS 模块
- `/docs`：Swagger API 文档入口
- `TenantContextInterceptor`：按 JWT membership 和请求头解析当前 App/Tenant 作用域
- `PermissionGuard` + `@RequirePermissions()`：阶段 1 核心接口已接入权限点
- `AuditInterceptor`：管理端/租户端写操作会自动记录审计日志
- 阶段 1 核心接口已补 DTO 校验：应用、租户、用户、角色权限、系统配置
- 登录后可调用 `/auth/contexts` 获取可切换 App/Tenant，`/auth/menus` 获取当前用户菜单树
- `/auth/switch-context` 会校验 membership 并返回带 `activeContext` 的新 JWT
- 租户成员管理已具备基础闭环：列表、添加成员、改角色、禁用成员
- 租户角色模板已具备基础闭环：可查询可用角色、为租户初始化默认角色
- 创建租户默认会初始化租户角色；传入 `owner` 时会自动创建/绑定负责人为 `tenant_owner`

## 2. 模块边界

| 模块 | 职责 |
|---|---|
| `auth` | 登录、JWT、当前用户 |
| `identity` | 用户账号 |
| `app-center` | 应用管理 |
| `tenancy` | 租户管理、审核、禁用 |
| `permission` | 角色、权限、授权 |
| `billing` | 功能、套餐、订阅、订单、支付流水入口 |
| `usage` | 用量流水、额度桶、权益校验 |
| `ai-center` | 服务商、模型、路由、Prompt、调用日志 |
| `knowledge` | 文件、知识库、解析任务、RAG 查询入口 |
| `developer` | API Key、Webhook |
| `tasks` | 异步任务记录 |
| `audit` | 审计日志 |
| `system` | 设置、字典 |
| `dashboard` | 汇总统计 |

## 3. 第一阶段必须补硬的规则

### 3.1 租户上下文

所有非平台级业务查询必须绑定：

```text
app_id
tenant_id
```

`tenant_id` 不能相信前端传值，正式实现应按优先级解析：

1. JWT 中当前 membership
2. API Key 绑定的 app/tenant
3. 平台管理员显式切换的 app/tenant

当前实现的解析优先级：

```text
x-app-id / x-tenant-id 请求头
activeContext
第一个 membership
```

### 3.2 权限判断

接口权限采用：

```text
module.resource.action
```

示例：

```text
tenant.read
tenant.create
billing.order.read
ai.prompt.publish
knowledge.file.upload
```

正式开发时需要增加：

- `@RequirePermissions(...)` 装饰器
- `PermissionGuard`
- 菜单权限和按钮权限数据种子
- 数据范围过滤器

### 3.3 审计日志

这些动作必须写入 `audit_logs`：

- 登录失败和敏感登录异常
- 登录成功
- 租户/App 上下文切换成功或失败
- 权限拒绝
- 创建、更新、禁用 App
- 租户审核、禁用、套餐变更
- 角色和权限变更
- 租户成员新增、改角色、禁用
- API Key 创建、禁用
- Prompt 发布和回滚
- 支付回调处理

## 4. API 分层

| 前缀 | 用途 |
|---|---|
| `/auth` | 登录和当前用户 |
| `/admin/v1` | 平台/管理端 API |
| `/tenant/v1` | 租户自服务 API |
| `/open/v1` | 用户端或外部开放 API |
| `/payment/webhook/*` | 支付回调 |

## 5. 数据库实现策略

第一版使用共享数据库、共享表：

```text
PostgreSQL public schema
业务表 app_id + tenant_id 隔离
平台级数据 tenant_id = null
```

后续数据量上来后再拆：

- 热日志表分区
- 向量数据迁移到专用向量库
- 大客户迁移独立 schema 或独立库

## 6. AI Gateway 补全点

当前 `/open/v1/ai/chat` 和 `/open/v1/ai/generate` 已保留入口，下一步需要实现：

1. API Key 鉴权
2. 权益校验：`UsageService.checkEntitlement`
3. 模型路由：`ai_model_routes`
4. Provider Adapter：OpenAI、通义、DeepSeek 等
5. Token 和成本计算
6. `ai_call_logs` 和 `usage_ledger` 双写
7. 失败 fallback

## 7. RAG 补全点

当前 `knowledge` 模块已保留队列入口，下一步需要实现：

1. MinIO 真实上传
2. 文件解析 Worker
3. Chunk 切分策略
4. Embedding 生成
5. pgvector 字段和检索 SQL
6. 来源引用
7. `rag_query_logs` 和用量流水

## 8. 支付补全点

当前订单和支付流水模型已具备，下一步需要：

1. 支付配置表或 `settings` 配置
2. 微信/支付宝创建支付单
3. 回调验签
4. 幂等处理
5. 订单状态更新
6. 订阅开通
7. 支付异常告警任务

## 9. 推荐开发顺序

1. 安装依赖并跑通数据库迁移
2. 完成 DTO 和参数校验
3. 加租户上下文解析
4. 加权限 Guard
5. 加审计拦截器
6. 完成阶段 1 的 CRUD 和验收
7. 再进入计费、AI、知识库
