# Nova Creator Platform

独立的 AI 创作平台，包含 Vue 3 用户端、Vue 3 管理端与 Go API。

## 技术栈

- 用户端与管理端：Vue 3、Vite、TypeScript、Vue Router、Pinia、Element Plus、Lucide。
- API：Go、Chi、pgx、go-redis、bcrypt、JWT、结构化日志和优雅关闭。
- 基础设施：PostgreSQL、Redis、MinIO/S3，开发环境由 Docker Compose 提供。
- 接口约定：统一使用 `/api/v1` 前缀与 `{ code, data, msg }` 响应结构。

## 目录

```text
apps/web        用户端，默认端口 5173
apps/admin      管理端，默认端口 5174
services/api    Go API，默认端口 8080
```

## 本地开发

要求 Node.js 22+、pnpm 11+、Go 1.24+。

```bash
pnpm install
docker compose up -d postgres redis minio
pnpm dev:web
pnpm dev:admin
cd services/api && go run ./cmd/api
```

健康检查：`GET http://localhost:8080/api/v1/health/live`。本地 PostgreSQL 映射到 `localhost:55432`。数据库结构位于 `services/api/internal/platform/database/migrations/`，API 启动时自动执行。

### 一键启停

Windows 下可在项目目录运行：

```powershell
.\scripts\dev-stack.ps1 start
.\scripts\dev-stack.ps1 status
.\scripts\dev-stack.ps1 restart
.\scripts\dev-stack.ps1 stop
```

也可以使用 `scripts\dev-stack.cmd start|status|restart|stop`。脚本管理 API `8080`、用户端 `5173` 和管理端 `5174`，日志写入 `.artifacts/runtime/`，PID 与编译后的 API 写入 `.data/runtime/`。`start` 会启动 PostgreSQL 和 Redis；`stop` 默认保留数据库容器与数据，附加 `-StopInfrastructure` 才会停止容器。可在被 Git 忽略的 `.env.local` 中覆盖 `.env.example` 中的环境变量。

## 认证接口

- `POST /api/v1/auth/register`：使用邮箱、用户名和密码注册。
- `POST /api/v1/auth/login`：登录并签发 JWT Access Token。
- `GET /api/v1/auth/me`：读取当前用户。

管理端使用同一登录接口，但 `/api/v1/admin/*` 额外要求 `role=admin`。数据库没有管理员时，迁移会将最早注册账号设为初始管理员。

## 用户管理接口

- `GET /api/v1/admin/users`：服务端分页查询用户，支持邮箱、用户名、补零账号 ID、角色和状态筛选。
- `POST /api/v1/admin/users`：管理员创建普通用户或管理员账号。
- `PATCH /api/v1/admin/users/{accountId}`：修改邮箱、用户名、角色和状态。
- `PATCH /api/v1/admin/users/{accountId}/password`：管理员重置用户密码。

管理界面统一显示公开账号 ID，例如 `ID：0001`，不展示内部 UUID。服务端禁止当前管理员停用或降级自己，并保证系统至少保留一个启用管理员。

## 积分接口

- `GET /api/v1/points`：读取当前用户积分余额和最近积分流水。
- `GET/PUT /api/v1/admin/points/rules`：读取或保存初始积分、默认模型成本、单模型成本及图片/视频参数倍率。
- `POST /api/v1/admin/users/{accountId}/points`：管理员按正负数调整用户积分并记录原因。

图片任务创建时在同一数据库事务中预扣积分、创建素材和生成任务；余额不足返回 HTTP 402。Worker 失败时在失败事务中原子退款，`generation-refund:{taskId}` 幂等键保证只退一次。客户端侧边栏和移动端顶部展示当前余额，并在创建任务或失败退款后刷新。

## 素材接口

- `GET /api/v1/assets`：按当前用户分页查询，支持 `type=image|video`、`source=generated|uploaded` 与 `search`。
- `POST /api/v1/assets`：使用 `multipart/form-data` 上传图片、视频或音频。
- `GET /api/v1/assets/{id}/content`：受保护的素材预览与下载。

## 生成接口

- `GET /api/v1/models`：读取启用渠道中的启用模型，支持 `capability=text|image|video|audio` 定向查询。
- `GET /api/v1/generations/capabilities`：读取图片生成可用模型、比例和分辨率。
- `POST /api/v1/generations/images`：提交 `prompt`、`model`、`size` 和 `quality` 创建图片任务。
- `GET /api/v1/generations/{id}`：读取当前用户的生成任务状态。

生成任务保存稳定的渠道、模型和参考素材角色。Worker 按渠道协议、鉴权和高级路径调用上游；当前原生执行 OpenAI 兼容图片、Stable Diffusion 图片以及 CompShare MiniMax H3 视频协议，MiniMax H3 支持文生视频、首尾帧和图片/视频/音频全能参考。

首页提交图片任务后保持在当前创作页，并立即把任务加入“最近创作”。列表仅在存在生成中记录时按 `VITE_GENERATION_REFRESH_INTERVAL_MS` 静默刷新，完成或失败后自动停止；刷新期间复用未变化的媒体预览，不替换为加载骨架。

用户端和管理端路由采用页面级动态加载。素材页不会预加载首页、登录或注册页面；管理登录页不会预加载模型渠道及其 Element Plus 完整样式。Vite 开发模式仍会按 ES 模块请求运行时依赖，生产构建则输出独立页面代码块。

用户端不依赖 Element Plus 运行时：创作参数使用原生受控下拉，通知使用轻量全局组件。Google Fonts 阻塞式导入已移除，首页远程山景在表单和数据开始加载后以低优先级异步显示。

## 模型渠道

- `GET /api/v1/admin/protocols`：返回与 VOZEB 注册表一致的 14 个协议。
- `GET/POST /api/v1/admin/channels`：查询或创建渠道。
- `PATCH/DELETE /api/v1/admin/channels/{id}`：更新或删除渠道。
- `POST /api/v1/admin/channels/{id}/test`：测试渠道模型目录。
- `POST /api/v1/admin/channels/{id}/models/sync`：同步上游或官方预置模型。
- `POST/PATCH/DELETE /api/v1/admin/channels/{id}/models[...]`：维护文本、图片、视频和音频模型。

支持的协议：OpenAI、昱梦、Google Gemini/Veo、Seedance 2.0、Stable Diffusion、火山方舟视频、sub2api、New API、VOZEB 推荐、Seedance 2.0 特价版、自定义协议、GlobalAiOpc、通用兼容和自动识别。

渠道 `advancedConfig` 结构化保存 API 格式、鉴权方式、模型目录、创建/编辑/查询/取消路径、请求模板、结果字段、状态字段和参考素材能力。严格协议使用注册表默认配置，自定义和兼容协议允许管理员编辑高级字段。

API Key 使用由 `JWT_SECRET` 派生的 AES-GCM 密钥加密保存，接口只返回是否已配置和脱敏掩码。`OPENAI_BASE_URL`、`OPENAI_API_KEY` 和 `OPENAI_IMAGE_MODEL` 仅用于数据库为空时导入默认渠道。
