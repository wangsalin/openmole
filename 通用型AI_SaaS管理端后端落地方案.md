# 通用型 AI SaaS 管理端后端落地方案

> 版本：v1.0  
> 适用场景：通用 SaaS 管理后台、AI SaaS 平台、知识库/RAG 系统、多租户商业化平台、可复用后台底座  
> 核心目标：构建一套可复用、可扩展、可商业化、可治理 AI 成本和知识资产的 SaaS 后端系统。

---

## 目录

1. [项目定位](#一项目定位)
2. [总体架构](#二总体架构)
3. [技术选型](#三技术选型)
4. [后端模块拆分](#四后端模块拆分)
5. [核心数据模型](#五核心数据模型)
6. [多租户设计](#六多租户设计)
7. [认证与权限设计](#七认证与权限设计)
8. [应用中心设计](#八应用中心设计)
9. [租户中心设计](#九租户中心设计)
10. [商业化与计费系统](#十商业化与计费系统)
11. [AI 中心设计](#十一ai-中心设计)
12. [Prompt 管理设计](#十二prompt-管理设计)
13. [知识库与 RAG 设计](#十三知识库与-rag-设计)
14. [文件资产系统](#十四文件资产系统)
15. [开发者中心与开放 API](#十五开发者中心与开放-api)
16. [Webhook 设计](#十六webhook-设计)
17. [任务系统设计](#十七任务系统设计)
18. [审计日志设计](#十八审计日志设计)
19. [系统配置设计](#十九系统配置设计)
20. [仪表盘与统计分析](#二十仪表盘与统计分析)
21. [支付系统设计](#二十一支付系统设计)
22. [核心业务流程](#二十二核心业务流程)
23. [API 设计示例](#二十三api-设计示例)
24. [安全设计](#二十四安全设计)
25. [数据库设计规范](#二十五数据库设计规范)
26. [事件系统设计](#二十六事件系统设计)
27. [MVP 开发阶段](#二十七mvp-开发阶段)
28. [第一版数据库表清单](#二十八第一版数据库表清单)
29. [部署架构](#二十九部署架构)
30. [风险与避坑](#三十风险与避坑)
31. [推荐落地路线](#三十一推荐落地路线)
32. [最终后端蓝图](#三十二最终后端蓝图)

---

# 一、项目定位

这个项目不是一个普通的后台管理系统，而是一套：

> **通用 SaaS 控制中心 + AI 能力网关 + 计费用量系统 + 知识库/RAG 数据层。**

它的目标不是只服务某一个单独项目，而是为多个不同用户端提供统一后台能力。

例如未来可以服务：

- 门店转让平台
- 餐饮营销助手
- 海报生成工具
- 本地生活 CRM
- 招商加盟系统
- 企业知识库问答系统
- AI 客服系统
- 小程序 SaaS
- 内部运营管理工具

用户端可以自由开发，后端统一提供：

- 应用管理
- 租户管理
- 账号权限
- 套餐计费
- 支付订单
- AI 模型治理
- Prompt 管理
- 知识库与 RAG
- 文件资产
- 调用日志
- 用量统计
- 开放 API
- Webhook
- 审计日志
- 系统配置

一句话定义：

> **这是一套面向 AI SaaS 项目的通用后端操作系统。**

---

# 二、总体架构

第一版不建议直接做微服务。微服务会带来大量额外复杂度，比如服务治理、链路追踪、配置中心、容器编排、服务发现、部署运维等。

更适合的架构是：

> **模块化单体架构 Modular Monolith**

也就是：

- 一个主后端项目
- 内部按业务域清晰拆分模块
- 数据库统一管理
- 异步任务由 Worker 单独执行
- 文件解析、向量化、AI 批处理走任务队列
- 后期业务量起来后，再按模块拆成微服务

## 2.1 架构分层

```text
管理端前端 / 用户端 / 开放 API
        ↓
API Gateway / Backend API
        ↓
认证鉴权层 Auth + Tenant Context
        ↓
业务模块层
        ↓
PostgreSQL / Redis / Object Storage / Vector DB / Queue
        ↓
Worker 任务系统
```

## 2.2 三个核心平面

### 1. Control Plane 控制面

负责后台管理能力：

- 应用管理
- 租户管理
- 权限管理
- 套餐管理
- 支付配置
- AI 配置
- Prompt 管理
- 知识库配置
- 系统设置

### 2. Runtime Plane 运行面

负责用户端真实调用：

- 用户端 API
- AI 调用
- RAG 检索
- 文件上传
- 权益校验
- 用量统计
- Webhook 回调

### 3. Data Plane 数据面

负责资产和数据沉淀：

- 文件
- 向量数据
- 知识库
- 调用日志
- 任务日志
- 用量流水
- 财务流水

重点判断：

> 管理端页面只是表层，真正有价值的是运行面和数据面。

---

# 三、技术选型

## 3.1 后端主框架

推荐：

```text
NestJS + TypeScript
```

原因：

- 适合模块化后端
- 与前端技术栈统一
- 支持装饰器、中间件、守卫、拦截器
- 做 RBAC、OpenAPI、队列、任务、日志比较方便
- 适合中小团队快速开发
- 后期重构微服务也有路径

备选：

- Java Spring Boot：成熟稳定，但开发启动成本较高
- FastAPI：开发快，但大型权限和领域模块管理需要更多规范
- Go：性能好，但业务后台开发效率未必最高

第一版建议：

> **NestJS + TypeScript。**

## 3.2 数据库

推荐：

```text
PostgreSQL
```

原因：

- 适合复杂 SaaS 数据模型
- 支持 JSONB，适合配置型数据
- 事务能力强
- 可扩展 pgvector 做向量检索
- 比 MySQL 更适合 AI 元数据、权限配置、统计聚合

## 3.3 ORM

推荐：

```text
Prisma
```

原因：

- 开发效率高
- 类型提示好
- 迁移方便
- 适合快速搭建 MVP

备选：

- Drizzle：更接近 SQL，可控性更强
- TypeORM：NestJS 生态常见，但复杂项目里维护体验一般

## 3.4 缓存

推荐：

```text
Redis
```

用途：

- 登录态缓存
- 权限缓存
- 验证码
- 接口限流
- AI 响应缓存
- 队列
- 分布式锁
- 统计缓存

## 3.5 异步任务

推荐：

```text
BullMQ + Redis
```

用途：

- 文件解析
- 知识库向量化
- AI 批处理
- 支付回调补偿
- Webhook 重试
- 日报生成
- 用量聚合
- 订阅过期检查

## 3.6 文件存储

推荐：

```text
开发环境：MinIO
生产环境：S3 / 阿里云 OSS / 腾讯云 COS
```

用途：

- 原始文件存储
- 图片素材
- 文档附件
- 解析结果
- 导出文件

## 3.7 向量数据库

第一版推荐：

```text
PostgreSQL + pgvector
```

原因：

- 架构简单
- 运维成本低
- 与主业务数据统一
- 足够支撑第一阶段知识库/RAG

后期数据量大时再考虑：

- Qdrant
- Milvus
- Weaviate
- Pinecone

## 3.8 搜索引擎

第一版可以先不引入独立搜索引擎。

后期可引入：

```text
Meilisearch / Elasticsearch
```

用于：

- 文件全文搜索
- 知识库搜索
- 订单搜索
- 租户搜索
- 日志搜索

---

# 四、后端模块拆分

不要按技术目录堆代码，例如 controller、service、dto 这种大杂烩。应该按业务域拆模块。

推荐目录结构：

```text
src/
  modules/
    auth/                 登录认证
    identity/             用户、账号、角色
    tenancy/              租户、商户
    app-center/           应用管理
    permission/           权限、菜单、功能点
    billing/              套餐、订单、支付、账单
    usage/                用量、额度、限额
    ai-center/            模型、Prompt、AI调用
    knowledge/            知识库、文件、RAG
    workflow/             工作流、任务编排
    audit/                审计日志
    notification/         通知中心
    developer/            API Key、Webhook
    system/               系统配置、字典、标签
    dashboard/            仪表盘、统计
  common/
    database/
    guards/
    decorators/
    filters/
    interceptors/
    utils/
    events/
    queue/
```

## 4.1 模块调用原则

不要让模块之间随便互相调用。

比如 AI 调用不要直接修改订单或套餐，而是通过 Usage / Entitlement 服务。

推荐调用关系：

```text
AI Center → Usage Service → Billing / Entitlement
Knowledge → Usage Service
Open API → Auth → Permission → Feature Entitlement
```

核心原则：

> **业务模块之间通过明确的服务接口或事件通信，不要互相侵入。**

---

# 五、核心数据模型

最少需要 12 个核心对象：

```text
App              应用
Tenant           租户
User             用户
Membership       成员关系
Role             角色
Permission       权限
Feature          功能
Plan             套餐
Subscription     订阅
Usage            用量
AIConfig         AI 配置
KnowledgeBase    知识库
```

推荐核心关系：

```text
Platform
  └── App
        └── Tenant
              ├── User / Membership
              ├── Subscription
              ├── KnowledgeBase
              ├── Usage
              └── AI Calls
```

## 5.1 核心对象解释

| 对象 | 说明 |
|---|---|
| App | 一个用户端业务，例如门店转让平台、餐饮营销助手 |
| Tenant | 一个客户主体，例如商户、企业、团队、个人开发者 |
| User | 真实登录账号 |
| Membership | 用户与租户之间的成员关系 |
| Role | 权限集合 |
| Permission | 具体权限点 |
| Feature | 可开关、可计费的功能能力 |
| Plan | 套餐 |
| Subscription | 租户当前订阅状态 |
| Usage | 用量流水 |
| AIConfig | 模型、路由、Prompt、RAG 等配置 |
| KnowledgeBase | 平台级、应用级、租户级知识资产 |

---

# 六、多租户设计

SaaS 系统最核心的是多租户隔离。

可选方案有三种。

## 6.1 方案 A：共享数据库、共享表、tenant_id 隔离

所有租户共用一个数据库，同一张表通过 `tenant_id` 区分。

例如：

```text
orders
- id
- app_id
- tenant_id
- amount
- status
```

优点：

- 开发最快
- 运维简单
- 成本最低
- 适合 MVP 和中小规模 SaaS

缺点：

- 必须严格防止串租户
- 查询必须统一加租户过滤

## 6.2 方案 B：一个租户一个 Schema

优点：

- 隔离更强

缺点：

- 迁移复杂
- 运维麻烦
- 第一版没必要

## 6.3 方案 C：一个租户一个数据库

优点：

- 隔离最强

缺点：

- 成本高
- 运维复杂
- 不适合早期

## 6.4 推荐方案

第一版推荐：

```text
共享数据库 + tenant_id 隔离
```

必须遵守四条规则：

1. 所有业务表必须有 `app_id` 和 `tenant_id`
2. 后端根据登录态或 API Key 解析租户，不允许前端随便指定 `tenant_id`
3. 所有查询必须经过 Tenant Scope
4. 审计日志必须记录 `app_id`、`tenant_id`、`user_id`

## 6.5 通用字段

大部分业务表建议包含：

```text
id
app_id
tenant_id
created_by
updated_by
created_at
updated_at
deleted_at
```

平台级数据可以：

```text
tenant_id = null
```

比如：

- 平台公共知识库
- 平台套餐
- 平台 Prompt
- 平台系统配置

---

# 七、认证与权限设计

不要只做“管理员”和“普通用户”。

推荐：

```text
RBAC + 数据范围 + 功能权限
```

## 7.1 用户体系

不要把 User 直接绑死在 Tenant 上。

因为一个用户未来可能加入多个租户、多个团队、多个应用。

推荐：

```text
users
- id
- phone
- email
- password_hash
- status


tenant_memberships
- id
- user_id
- tenant_id
- role_id
- status
```

## 7.2 内置角色

建议内置：

```text
platform_super_admin   平台超级管理员
platform_operator      平台运营
platform_finance       平台财务
platform_ai_admin      AI 管理员
app_admin              应用管理员
tenant_owner           租户拥有者
tenant_admin           租户管理员
tenant_member          租户成员
readonly               只读
```

## 7.3 权限类型

权限分四层：

| 类型 | 说明 |
|---|---|
| 菜单权限 | 能不能看到某个页面 |
| 按钮权限 | 能不能新增、编辑、删除、导出 |
| 数据权限 | 能看全平台、某应用、某租户、自己的数据 |
| API 权限 | 开放接口能不能调用 |

## 7.4 权限标识规范

建议采用点号命名：

```text
tenant.read
tenant.create
tenant.update
tenant.disable

billing.order.read
billing.payment.refund

ai.prompt.read
ai.prompt.publish
ai.model.update

knowledge.file.upload
knowledge.kb.vectorize
```

---

# 八、应用中心设计

应用 App 是这个系统非常关键的对象。

因为用户端可以自由开发，所以后台不能只围绕“商户”设计。

一个 App 可以是：

- 门店转让平台
- 餐饮营销助手
- 海报生成工具
- 本地生活 CRM
- 企业知识库系统

## 8.1 应用表

```text
apps
- id
- name
- app_key
- app_type
- domain
- status
- default_plan_id
- config
- created_at
- updated_at
```

## 8.2 应用配置内容

每个 App 可以有自己的：

- 租户
- 套餐
- 功能
- Prompt
- 模型路由
- 知识库
- 支付配置
- API Key
- Webhook
- 审核规则
- 运营配置

## 8.3 为什么必须有 App

如果没有 App，后面所有业务都会挤在一起。

比如门店转让平台、餐饮营销助手、海报工具、CRM 都混在一套“商户管理”里，后期会非常混乱。

正确结构应该是：

```text
Platform
  └── App
        └── Tenant
              └── User
```

---

# 九、租户中心设计

租户 Tenant 可以理解为客户主体。

在不同业务中，它可以被前端显示为：

- 商户
- 企业
- 门店
- 团队
- 机构
- 个人开发者

## 9.1 租户表

```text
tenants
- id
- app_id
- name
- tenant_type
- contact_name
- phone
- email
- industry
- region
- status
- current_plan_id
- subscription_status
- expired_at
- source
- remark
- created_at
- updated_at
```

## 9.2 租户状态

```text
pending_review      待审核
active              正常
rejected            审核拒绝
disabled            禁用
overdue             欠费
expired             已过期
```

## 9.3 租户入驻审核

审核对象不只包括商户入驻，后期还可能包括：

- 入驻审核
- 内容审核
- 文件审核
- 模板审核
- AI 输出审核
- 支付审核

审核表可以设计为通用审核表：

```text
reviews
- id
- app_id
- tenant_id
- review_type
- resource_type
- resource_id
- submitter_id
- status
- materials
- risk_tags
- reviewer_id
- review_comment
- reviewed_at
- created_at
```

---

# 十、商业化与计费系统

商业化系统不能只做订单表。

完整链路应该是：

```text
套餐 Plan
权益 Entitlement
订阅 Subscription
订单 Order
支付 Payment
用量 Usage
额度 Quota
流水 Ledger
```

## 10.1 套餐表

```text
plans
- id
- app_id
- name
- description
- price_monthly
- price_yearly
- status
- is_public
- is_recommended
- created_at
- updated_at
```

## 10.2 功能表

```text
features
- id
- feature_key
- name
- module
- description
- is_metered
- status
- created_at
```

功能示例：

```text
ai_text_generate
ai_image_generate
knowledge_base
rag_search
workflow_run
file_upload
api_access
webhook_access
```

## 10.3 套餐权益表

```text
plan_features
- id
- plan_id
- feature_id
- enabled
- quota_type
- quota_limit
- reset_cycle
- created_at
```

示例：

```text
专业版：
- 子账号 10 个
- 知识库 5 个
- 文件容量 10GB
- AI 调用 10000 次/月
- Workflow 执行 1000 次/月
- API 调用 50000 次/月
```

## 10.4 订阅表

```text
subscriptions
- id
- app_id
- tenant_id
- plan_id
- status
- start_at
- end_at
- auto_renew
- created_at
- updated_at
```

订阅状态：

```text
active
trialing
expired
cancelled
past_due
```

## 10.5 用量流水表

用量流水要做成不可随意修改的记录。

```text
usage_ledger
- id
- app_id
- tenant_id
- feature_key
- metric
- quantity
- source_type
- source_id
- cost_amount
- charge_amount
- occurred_at
- created_at
```

一次 AI 调用示例：

```text
feature_key: ai_text_generate
metric: token
quantity: 2380
source_type: ai_call
source_id: xxx
cost_amount: 0.012
charge_amount: 0.035
```

## 10.6 权益校验流程

所有收费能力调用前都必须走权益校验。

```text
用户请求
  ↓
认证
  ↓
租户上下文
  ↓
权限校验
  ↓
功能是否开通
  ↓
额度是否足够
  ↓
执行功能
  ↓
记录用量流水
  ↓
更新统计缓存
```

伪代码：

```ts
await entitlementService.assertCanUse({
  tenantId,
  featureKey: 'ai_text_generate',
  estimatedQuantity: 1000,
})

const result = await aiService.call(...)

await usageService.record({
  tenantId,
  featureKey: 'ai_text_generate',
  quantity: result.totalTokens,
  sourceType: 'ai_call',
  sourceId: result.callId,
})
```

---

# 十一、AI 中心设计

AI 能力不能散落在业务代码里。

必须统一走：

```text
AI Gateway
```

## 11.1 AI 调用完整流程

```text
业务请求
  ↓
校验租户套餐和额度
  ↓
选择 Prompt 版本
  ↓
渲染变量
  ↓
是否需要 RAG 检索
  ↓
模型路由选择
  ↓
成本预估
  ↓
调用模型供应商
  ↓
失败重试 / 模型降级
  ↓
记录 token、成本、响应
  ↓
扣减用量
  ↓
返回结果
```

## 11.2 模型服务商表

```text
ai_providers
- id
- name
- provider_type
- base_url
- api_key_encrypted
- status
- timeout_ms
- rate_limit
- created_at
- updated_at
```

服务商示例：

- OpenAI
- Claude
- Gemini
- DeepSeek
- 通义千问
- 智谱
- 火山方舟
- 自建模型

## 11.3 模型表

```text
ai_models
- id
- provider_id
- model_name
- display_name
- model_type
- input_price
- output_price
- context_window
- status
- created_at
```

模型类型：

```text
chat
embedding
rerank
vision
image
audio
```

## 11.4 模型路由表

```text
ai_model_routes
- id
- app_id
- scene_key
- primary_model_id
- fallback_model_id
- strategy
- max_tokens
- temperature
- cache_enabled
- status
```

场景示例：

```text
store_transfer_copywriting
customer_service_reply
knowledge_qa
audit_content
daily_report_summary
poster_copywriting
```

策略：

```text
cost_first        成本优先
quality_first     质量优先
speed_first       速度优先
fallback_only     只做兜底
```

## 11.5 AI 调用日志表

```text
ai_call_logs
- id
- app_id
- tenant_id
- user_id
- scene_key
- prompt_version_id
- provider_id
- model_id
- input_tokens
- output_tokens
- total_tokens
- cost_amount
- charge_amount
- latency_ms
- status
- error_message
- request_hash
- cache_hit
- created_at
```

这个表非常重要。

它解决：

- 谁调用了 AI
- 哪个功能消耗最多
- 成本是多少
- 是否亏钱
- 哪个模型失败多
- 哪些 Prompt 输出不稳定
- 哪些租户异常消耗

---

# 十二、Prompt 管理设计

Prompt 不要只是一个文本框。

它应该是可版本化、可测试、可发布、可回滚的 AI 资产。

## 12.1 Prompt 主表

```text
prompts
- id
- app_id
- tenant_id
- name
- prompt_key
- scene_key
- status
- created_at
- updated_at
```

## 12.2 Prompt 版本表

```text
prompt_versions
- id
- prompt_id
- version
- content
- variables_schema
- model_route_id
- status
- created_by
- published_at
- created_at
```

状态：

```text
draft
esting
published
archived
```

应为：

```text
draft
testing
published
archived
```

## 12.3 Prompt 测试记录

```text
prompt_test_runs
- id
- prompt_version_id
- input_variables
- output_text
- model_id
- input_tokens
- output_tokens
- cost_amount
- latency_ms
- created_by
- created_at
```

## 12.4 为什么必须做版本管理

AI 功能经常出现这些情况：

- 今天改了 Prompt，明天效果变差
- 客户投诉输出异常
- 某个版本成本突然升高
- 旧 Prompt 效果更好，需要回滚
- 不同模型下输出效果不一样

没有版本管理，后期无法排查问题。

---

# 十三、知识库与 RAG 设计

知识库不是简单上传文件。

完整链路是：

```text
上传文件
  ↓
保存原始文件
  ↓
创建文件记录
  ↓
进入解析队列
  ↓
提取文本
  ↓
清洗文本
  ↓
切分 Chunk
  ↓
生成 Embedding
  ↓
写入向量库
  ↓
更新知识库索引状态
```

## 13.1 知识库表

```text
knowledge_bases
- id
- app_id
- tenant_id
- name
- scope
- description
- status
- created_at
- updated_at
```

scope：

```text
platform_public    平台公共
app_public         应用公共
tenant_private     租户私有
user_private       用户私有
```

## 13.2 知识库文件表

```text
knowledge_files
- id
- kb_id
- app_id
- tenant_id
- file_id
- file_name
- file_type
- file_size
- parse_status
- vector_status
- uploaded_by
- created_at
```

## 13.3 文档 Chunk 表

```text
knowledge_chunks
- id
- kb_id
- file_id
- app_id
- tenant_id
- chunk_index
- content
- token_count
- metadata
- embedding
- created_at
```

如果使用 pgvector，embedding 可直接存在 PostgreSQL。

## 13.4 RAG 配置表

```text
rag_configs
- id
- app_id
- tenant_id
- kb_id
- embedding_model_id
- chunk_size
- chunk_overlap
- top_k
- score_threshold
- rerank_enabled
- cite_source_enabled
- created_at
- updated_at
```

## 13.5 RAG 检索权限

RAG 检索必须加权限过滤。

查询向量时必须带：

```text
app_id
tenant_id
kb_scope
```

否则会出现严重的数据串租户风险。

## 13.6 RAG 查询流程

```text
用户问题
  ↓
转 embedding
  ↓
按 app_id / tenant_id / kb_id 过滤
  ↓
向量相似度搜索
  ↓
可选 rerank
  ↓
拼接引用上下文
  ↓
调用模型生成答案
  ↓
记录引用来源和调用日志
```

---

# 十四、文件资产系统

文件不是简单上传。

要支持：

- 原始文件
- 解析后的文本
- 向量化状态
- 权限控制
- 文件引用关系
- 存储额度统计
- 文件去重

## 14.1 文件表

```text
files
- id
- app_id
- tenant_id
- bucket
- object_key
- original_name
- mime_type
- size
- hash
- source
- uploaded_by
- status
- created_at
```

## 14.2 为什么需要 hash

用于文件去重。

如果同一个文件重复上传，可以减少：

- 存储成本
- 解析成本
- 向量化成本
- AI 成本

---

# 十五、开发者中心与开放 API

既然用户端可以自由开发，后端必须提供稳定开放 API。

建议分三类 API。

## 15.1 Admin API

给平台管理端使用：

```text
/admin/v1/apps
/admin/v1/tenants
/admin/v1/orders
/admin/v1/prompts
/admin/v1/knowledge-bases
```

## 15.2 Tenant API

给租户后台或商户端使用：

```text
/tenant/v1/profile
/tenant/v1/files
/tenant/v1/knowledge-bases
/tenant/v1/orders
```

## 15.3 Open API

给外部用户端或第三方调用：

```text
/open/v1/ai/chat
/open/v1/rag/query
/open/v1/files/upload
/open/v1/webhooks
```

Open API 不应该使用普通登录态，而应该使用 API Key。

## 15.4 API Key 表

```text
api_keys
- id
- app_id
- tenant_id
- name
- key_hash
- secret_hash
- scopes
- ip_whitelist
- rate_limit
- status
- last_used_at
- created_at
```

注意：

> 数据库里不能明文存 API Key，只能存 hash。

---

# 十六、Webhook 设计

Webhook 用于通知外部系统。

典型事件：

- 支付成功
- 文件解析完成
- 知识库向量化完成
- AI 任务完成
- 审核通过
- 工单回复
- 套餐到期
- 额度不足

## 16.1 Webhook 表

```text
webhooks
- id
- app_id
- tenant_id
- event_type
- target_url
- secret
- status
- created_at
- updated_at
```

## 16.2 Webhook 投递日志

```text
webhook_deliveries
- id
- webhook_id
- event_type
- payload
- response_status
- response_body
- retry_count
- delivered_at
- created_at
```

## 16.3 必须支持

- 签名
- 重试
- 幂等
- 失败记录
- 手动重发
- 超时控制

---

# 十七、任务系统设计

后台中的 Tasks 不应该只是普通待办，而是任务调度中心。

## 17.1 任务类型

```text
file_parse
file_vectorize
ai_batch_run
payment_sync
webhook_deliver
daily_report
usage_aggregate
subscription_expire_check
```

## 17.2 任务表

```text
tasks
- id
- app_id
- tenant_id
- task_type
- status
- payload
- result
- error_message
- retry_count
- started_at
- finished_at
- created_at
```

状态：

```text
pending
running
success
failed
cancelled
```

## 17.3 为什么任务系统重要

因为这些操作都不适合同步执行：

- 文件解析
- 向量化
- 批量 AI 生成
- 日报生成
- 支付状态同步
- Webhook 重试

没有任务系统，系统会卡顿，也很难排查失败原因。

---

# 十八、审计日志设计

这个系统涉及：

- 财务
- 支付
- AI 成本
- API Key
- 商户数据
- 知识库文件
- 系统配置

审计日志必须做。

## 18.1 审计日志表

```text
audit_logs
- id
- app_id
- tenant_id
- actor_user_id
- action
- resource_type
- resource_id
- before_data
- after_data
- ip
- user_agent
- created_at
```

## 18.2 需要记录的操作

```text
登录
创建租户
修改套餐
禁用商户
删除文件
发布 Prompt
修改模型 Key
退款
导出数据
生成 API Key
修改支付配置
删除知识库
修改系统配置
```

重要审计日志不要随便删除。

---

# 十九、系统配置设计

系统配置不要写死在代码里。

建议做分层配置。

## 19.1 配置层级

```text
platform 平台级
app      应用级
tenant   租户级
user     用户级
```

## 19.2 读取优先级

```text
user > tenant > app > platform > default
```

## 19.3 配置表

```text
settings
- id
- scope_type
- scope_id
- key
- value
- value_type
- created_at
- updated_at
```

配置示例：

```text
ai.default_model
payment.wechat.enabled
file.max_upload_size
auth.sms_login_enabled
rag.default_top_k
notification.email.enabled
```

这样每个应用、每个租户都可以有不同配置。

---

# 二十、仪表盘与统计分析

仪表盘不要每次实时扫大表。

应该用统计聚合表。

## 20.1 日统计表

```text
daily_metrics
- id
- date
- app_id
- tenant_id
- metric_key
- metric_value
- created_at
```

metric_key 示例：

```text
new_tenants
active_tenants
orders_amount
ai_calls
ai_tokens
ai_cost
file_upload_count
rag_queries
failed_tasks
new_orders
paying_tenants
```

## 20.2 统计方式

每天定时聚合。

仪表盘直接查询聚合表。

好处：

- 打开速度快
- 查询压力小
- 数据结构稳定
- 适合做趋势图

---

# 二十一、支付系统设计

支付系统不要只做订单表。

至少需要：

```text
orders
payment_transactions
refunds
subscriptions
invoices
```

## 21.1 订单表

```text
orders
- id
- app_id
- tenant_id
- order_no
- order_type
- amount
- status
- plan_id
- created_at
- updated_at
```

order_type：

```text
subscription
renewal
upgrade
topup
one_time
```

## 21.2 支付流水表

```text
payment_transactions
- id
- order_id
- provider
- provider_trade_no
- amount
- status
- raw_payload
- paid_at
- created_at
```

## 21.3 支付系统重点

必须支持：

- 支付回调验签
- 幂等处理
- 重复回调处理
- 支付状态补偿
- 回调日志记录
- 退款记录
- 订单状态机

重点：

> 不要相信前端支付成功回调。真正支付成功必须以后端支付平台回调为准。

---

# 二十二、核心业务流程

## 22.1 租户入驻流程

```text
用户注册
  ↓
创建 User
  ↓
提交商户资料
  ↓
创建 Tenant，状态 pending_review
  ↓
后台审核
  ↓
审核通过
  ↓
创建默认订阅
  ↓
分配默认角色
  ↓
开通功能权益
  ↓
发送通知
```

## 22.2 套餐购买流程

```text
租户选择套餐
  ↓
创建订单
  ↓
创建支付流水
  ↓
发起支付
  ↓
接收支付回调
  ↓
验证签名
  ↓
更新支付流水
  ↓
更新订单状态
  ↓
创建/更新订阅
  ↓
初始化权益额度
  ↓
记录审计日志
```

## 22.3 AI 调用流程

```text
用户端请求 AI
  ↓
API Key / 登录态认证
  ↓
解析 app_id / tenant_id
  ↓
检查功能权限
  ↓
检查 AI 额度
  ↓
选择 Prompt
  ↓
选择模型路由
  ↓
需要 RAG 则先检索知识库
  ↓
调用模型
  ↓
记录 AI 调用日志
  ↓
记录 Usage Ledger
  ↓
返回结果
```

## 22.4 文件知识库流程

```text
上传文件
  ↓
保存对象存储
  ↓
写入 files
  ↓
创建知识库文件记录
  ↓
投递 file_parse 任务
  ↓
解析文本
  ↓
切分 chunk
  ↓
投递 embedding 任务
  ↓
写入向量
  ↓
更新 vector_status
  ↓
通知完成
```

## 22.5 Prompt 发布流程

```text
创建 Prompt 草稿
  ↓
配置变量
  ↓
测试运行
  ↓
记录测试结果
  ↓
发布版本
  ↓
旧版本归档
  ↓
线上调用新版本
  ↓
可回滚
```

---

# 二十三、API 设计示例

## 23.1 应用管理

```text
GET    /admin/v1/apps
POST   /admin/v1/apps
GET    /admin/v1/apps/:id
PATCH  /admin/v1/apps/:id
POST   /admin/v1/apps/:id/disable
```

## 23.2 租户管理

```text
GET    /admin/v1/tenants
POST   /admin/v1/tenants
GET    /admin/v1/tenants/:id
PATCH  /admin/v1/tenants/:id
POST   /admin/v1/tenants/:id/approve
POST   /admin/v1/tenants/:id/disable
```

## 23.3 AI 调用

```text
POST   /open/v1/ai/chat
POST   /open/v1/ai/generate
POST   /open/v1/rag/query
GET    /admin/v1/ai/calls
GET    /admin/v1/ai/usage
```

## 23.4 Prompt 管理

```text
GET    /admin/v1/prompts
POST   /admin/v1/prompts
POST   /admin/v1/prompts/:id/versions
POST   /admin/v1/prompts/:id/test
POST   /admin/v1/prompts/:id/publish
POST   /admin/v1/prompts/:id/rollback
```

## 23.5 知识库管理

```text
GET    /admin/v1/knowledge-bases
POST   /admin/v1/knowledge-bases
POST   /admin/v1/knowledge-bases/:id/files
POST   /admin/v1/knowledge-bases/:id/rebuild-index
POST   /open/v1/knowledge-bases/:id/query
```

## 23.6 订单支付

```text
GET    /admin/v1/orders
POST   /tenant/v1/orders
GET    /tenant/v1/orders/:id
POST   /tenant/v1/orders/:id/pay
POST   /payment/webhook/wechat
POST   /payment/webhook/alipay
```

---

# 二十四、安全设计

## 24.1 必须做的安全项

```text
密码加密存储
API Key hash 存储
JWT 短期有效
Refresh Token 轮换
接口限流
IP 白名单
操作审计
敏感字段加密
支付回调验签
Webhook 签名
租户数据隔离
文件访问鉴权
```

## 24.2 敏感数据不能明文存储

这些字段必须加密：

```text
API Key
模型服务商密钥
支付密钥
Webhook Secret
短信密钥
对象存储密钥
邮件服务密钥
```

建议：

- 数据库中加密存储
- 加密主密钥放环境变量或密钥管理系统
- 前端只显示脱敏结果

---

# 二十五、数据库设计规范

## 25.1 通用字段

大部分表建议包含：

```text
id               UUID / ULID
app_id           应用 ID
tenant_id        租户 ID，可为空
created_at
updated_at
deleted_at
created_by
updated_by
```

## 25.2 删除策略

不要物理删除重要数据。

使用软删除：

```text
deleted_at
```

不能删除的数据：

- 财务流水
- 支付流水
- 用量流水
- 审计日志
- AI 调用日志
- 关键业务操作记录

## 25.3 ID 选择

推荐：

```text
ULID / UUID
```

优点：

- 分布式友好
- 不容易被枚举
- 适合开放 API

---

# 二十六、事件系统设计

后端内部建议做事件驱动。

## 26.1 事件示例

```text
tenant.created
tenant.approved
order.paid
subscription.activated
ai.call.completed
file.uploaded
file.vectorized
prompt.published
quota.exceeded
```

## 26.2 事件触发示例

`order.paid` 可以触发：

```text
更新订阅
初始化额度
发送通知
记录审计
生成站内消息
```

## 26.3 第一版实现方式

第一版可以使用代码内部事件。

不需要一开始上 Kafka、RabbitMQ。

后期系统复杂后，再拆消息队列。

---

# 二十七、MVP 开发阶段

不要从仪表盘开始做。

仪表盘是结果展示，不是系统核心。

真正开发顺序应该是下面这样。

## 阶段 1：基础骨架

目标：系统能登录、能分租户、能鉴权。

开发内容：

```text
用户登录
应用管理
租户管理
角色权限
菜单权限
系统配置
审计日志
```

验收标准：

```text
不同角色看到不同菜单
不同租户看不到彼此数据
平台管理员可以切换应用和租户
所有关键操作有审计日志
```

## 阶段 2：商业化能力

目标：能开套餐、能收钱、能限制功能。

开发内容：

```text
套餐管理
功能管理
权益管理
订单管理
支付设置
订阅管理
用量流水
额度校验
```

验收标准：

```text
租户购买套餐后自动开通功能
套餐到期后功能受限
AI / 文件 / API 调用能记录用量
超额后能限制或计费
```

## 阶段 3：AI 中心

目标：用户端可以通过统一 AI Gateway 调用模型。

开发内容：

```text
模型服务商
模型列表
模型路由
Prompt 管理
Prompt 测试
AI 调用日志
AI 成本统计
```

验收标准：

```text
不同场景可以走不同模型
Prompt 可以发布和回滚
每次 AI 调用都能看到 token、成本、耗时、错误
失败可以走备用模型
```

## 阶段 4：知识库和 RAG

目标：租户可以上传资料，AI 可以基于资料回答。

开发内容：

```text
文件上传
文件解析
知识库管理
Chunk 切分
Embedding
向量检索
RAG 查询
引用来源
```

验收标准：

```text
租户只能检索自己的知识库
平台公共知识可以被授权应用使用
文件解析失败有任务记录
RAG 调用能记录来源和成本
```

## 阶段 5：运营增强

目标：后台变成真正运营系统。

开发内容：

```text
仪表盘
站内日报
任务中心
工单系统
通知中心
Webhook
调用分析
```

---

# 二十八、第一版数据库表清单

第一版建议至少包含这些表。

```text
apps
tenants
users
tenant_memberships
roles
permissions
role_permissions
menus
role_menus

features
plans
plan_features
subscriptions
orders
payment_transactions
usage_ledger
quota_buckets

ai_providers
ai_models
ai_model_routes
prompts
prompt_versions
prompt_test_runs
ai_call_logs

files
knowledge_bases
knowledge_files
knowledge_chunks
rag_configs
rag_query_logs

api_keys
webhooks
webhook_deliveries

tasks
notifications
settings
audit_logs
daily_metrics
tags
dict_items
```

这些表已经不少，但这是比较完整的 SaaS + AI 后台底座。

---

# 二十九、部署架构

## 29.1 开发环境

推荐 Docker Compose：

```text
backend-api
backend-worker
postgres
redis
minio
```

## 29.2 生产环境第一版

```text
Nginx / API Gateway
  ↓
Backend API 多实例
  ↓
Worker 多实例
  ↓
PostgreSQL
Redis
Object Storage
Vector Store
```

## 29.3 必须做的运维能力

```text
数据库每日备份
对象存储备份策略
错误监控
接口日志
慢查询日志
队列失败任务告警
支付回调告警
AI 成本异常告警
磁盘容量告警
API 异常调用告警
```

---

# 三十、风险与避坑

## 30.1 不要做成普通后台模板

普通后台模板只能做 CRUD。

这个项目真正难的是：

```text
租户隔离
权益控制
用量计费
AI 成本
知识库权限
开放 API
```

这些才是核心。

## 30.2 不要一开始做复杂 Workflow Studio

Workflow 是大坑。

第一版只需要：

```text
Prompt 节点
RAG 节点
HTTP 节点
条件节点
输出节点
运行日志
```

不要一开始做复杂拖拽、循环、子流程、变量系统。

## 30.3 不要让 AI 调用散落在业务代码里

必须统一走 AI Gateway。

否则后期无法管理：

- 成本
- 日志
- 模型路由
- Prompt 版本
- 失败重试
- 限流
- 权益扣减

## 30.4 不要只做订单，不做用量流水

没有 usage ledger，后面会算不清：

```text
谁用了多少
成本多少
该不该扣费
有没有超额
哪个功能亏钱
哪个租户异常消耗
```

## 30.5 不要信任前端传来的 tenant_id

tenant_id 必须由后端从以下来源解析：

- 登录态
- API Key
- 域名
- App Key
- 当前用户 Membership

前端传来的 tenant_id 只能作为筛选条件，不能作为权限依据。

---

# 三十一、推荐落地路线

## 31.1 先用一个真实业务验证

建议第一个应用选择：

```text
门店转让平台
```

它可以作为第一个 App。

对应关系：

```text
App：门店转让平台
Tenant：商户 / 中介 / 门店主
Feature：发布信息、AI 文案、知识库、套餐
Plan：免费版、基础版、专业版
AI：门店转让标题、描述、客服问答
Knowledge：转让合同、行业知识、平台规则
```

这样你不是空做“通用后台”，而是边做业务边抽象。

## 31.2 先打通一条商业闭环

最重要的闭环：

```text
租户注册
  ↓
购买套餐
  ↓
上传资料
  ↓
调用 AI
  ↓
产生用量
  ↓
后台看到成本
  ↓
额度不足限制
```

这条链路跑通，这个 SaaS 后台就活了。

## 31.3 后续再扩展运营页面

底层对象跑通后，再加：

```text
仪表盘
工单
日报
海报模板
活动知识
产品库
品牌门店
Workflow
```

不要顺序反了。

---

# 三十二、最终后端蓝图

最终系统应该是：

```text
通用 SaaS 后端底座
├── 应用中心 App Center
├── 租户中心 Tenant Center
├── 身份权限 Identity & Permission
├── 商业化 Billing & Entitlement
├── 用量计费 Usage & Quota
├── AI 网关 AI Gateway
├── Prompt 版本管理 PromptOps
├── 知识库与 RAG Knowledge & Retrieval
├── 文件资产 File Assets
├── 开放 API Developer Platform
├── Webhook & Notification
├── 任务队列 Task Center
├── 审计日志 Audit
└── 运营分析 Analytics
```

第一版最应该做扎实的五条主线：

```text
1. App / Tenant / User / Role
2. Plan / Feature / Subscription / Usage
3. AI Provider / Model Route / Prompt / AI Call Log
4. File / KnowledgeBase / Chunk / RAG Query
5. Audit / Task / Settings / API Key
```

最终判断：

> 这个后端不是“后台管理系统”，而是一个可复用的 SaaS 操作系统。  
> 第一版不要追求大而全，先把多租户、权限、计费、AI 网关、知识库这几条主线做稳。
