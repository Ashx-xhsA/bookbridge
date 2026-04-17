# BookBridge 产品需求文档 v2

> 版本历史：v1 为 Python CLI 版本，见 `PRD.md` 历史提交。v2 起转向 Next.js Web App + Python Worker 架构。

---

## 问题陈述

BookBridge 是一个 AI 驱动的长文档翻译 web 平台。用户上传 PDF 后，平台自动解析章节结构，支持按章节选择性翻译，以沉浸式双列阅读视图（原文左 / 译文右）呈现结果。相较于传统整文档翻译，BookBridge 保证跨章节术语一致性，支持渐进式阅读——无需等待全书翻译完成。

---

## 目标用户

### Translator（注册用户）
上传 PDF、选择翻译语言和风格、管理词汇表、按章节触发翻译、发布项目为公开链接。

### Reader（访客）
通过公开链接无需注册访问已发布项目，在双列视图中阅读，切换双语 / 纯译文模式。

---

## 技术栈

| 层 | 技术 |
|---|---|
| 前端 / BFF | Next.js 15 App Router |
| 认证 | Clerk |
| 数据库 | PostgreSQL (Neon) via Prisma |
| 翻译 Worker | Python 3.11，现有 bookbridge 核心，FastAPI 包装，部署于 Railway |
| 向量检索 | ChromaDB（Worker 本地，RAG 加速层） |
| LLM | Anthropic Claude API（由 Python Worker 调用） |
| 部署 | Vercel（Next.js）+ Railway（Python Worker） |
| CI/CD | GitHub Actions |

---

## 功能需求

### FR1: 认证（Clerk）
- Translator：注册 / 登录后访问 Dashboard
- Reader：公开链接无需登录，直接进入阅读视图

### FR2: 项目管理（Translator）
- 上传 PDF，填写项目名、目标语言、翻译风格（文学 / 学术 / 技术）
- 项目列表展示：名称、进度（已译章节数 / 总章节数）、发布状态
- 发布 / 取消发布，生成公开阅读链接

### FR3: PDF 解析（Python Worker）
- 提取页面文本，检测章节边界，清理噪声
- 生成 ChunkManifest，写入 PostgreSQL
- 每个 Chunk 初始状态：`untranslated`

### FR4: 词汇表管理（Translator，Dashboard 内）
- Worker 自动提取命名实体，存入 PostgreSQL
- Translator 可审核、编辑、批准术语翻译
- 支持手动新增术语

### FR5: 章节翻译（Python Worker）
- 接收单章翻译请求，状态流转：`untranslated → queued → translating → translated | failed`
- RAG 注入相关词汇表术语到 Claude API prompt
- 翻译结果写回 PostgreSQL
- 失败自动重试一次

### FR6: 阅读视图（Reader + Translator）

**布局（参考 Readest）：**
- 顶部工具栏：Toggle Sidebar | 书名居中 | 字体大小调节
- 左侧目录栏（可折叠）：章节名 + 页码 + 翻译状态徽章（○ 未译 / ⟳ 翻译中 / ✓ 已译）
- 主区域：左列原文 / 右列译文，双列书页布局
- 未译章节：右列显示原文，顶部 Banner 显示「翻译本章」按钮（仅 Translator 可见）
- 底部：页面进度条 + 页码

**交互：**
- 点击目录章节 → 跳转到对应位置
- 「翻译本章」→ 触发 Worker 任务，右列实时状态更新（轮询）
- 顶部切换：双语 / 纯译文模式

### FR7: 质量检查（Python Worker）
- 词汇表一致性检查
- LLM 质量评分，结果存入 PostgreSQL
- Dashboard 内展示各章节质量分

---

## 数据模型（核心）

```
User          (Clerk managed)
Project       id, owner_id, title, language, skill, status, is_public, public_token
Chunk         id, project_id, title, start_page, end_page, original_text,
              translated_text, status, quality_score, order_index
Term          id, project_id, english, category, notes
Translation   id, term_id, language_code, translation, approved
```

---

## Worker API（FastAPI）

| 端点 | 描述 |
|---|---|
| `POST /parse` | 接收 PDF，解析并写 Chunk 到 PostgreSQL |
| `POST /translate/chunk` | 翻译单个章节 |
| `GET /job/{job_id}` | 查询任务状态 |
| `POST /glossary/extract` | 从已解析 chunks 提取术语 |

---

## Sprint 规划

### Sprint 2 — 优先部署
**目标：尽早建立可部署的全栈骨架，让 CI/CD pipeline 从本 sprint 起持续运行**
- Python Worker：FastAPI endpoints（`/parse`、`/translate/chunk`、`/job/{id}`）
- 实现 `harness/`（翻译编排器：chunk → Claude API → 写结果）
- SQLite → PostgreSQL 迁移（psycopg2）
- Python Worker 部署至 Railway
- Next.js 15 shell：Clerk auth（登录 / 注册页面可用）+ protected route 骨架 + 基础 layout
- 连接 Vercel，merge to main 触发 production deploy
- GitHub Actions CI pipeline 上线：lint、typecheck、unit tests、preview deploy、prod deploy、npm audit、AI PR review

### Sprint 3 — Next.js 全功能
**目标：从上传 PDF 到看到翻译结果的完整用户流程**
- Prisma schema（Project / Chunk / Term 表）
- PDF 上传 → 调用 Worker `/parse` → 章节列表展示
- Dashboard UI（项目列表 + 新建项目）
- 触发单章翻译 → polling → 状态更新
- Glossary 管理（Dashboard 内查看 / 编辑术语）

### Sprint 4 — 阅读视图 + 打磨
**目标：完整双栏阅读体验 + 生产级打磨**
- 双栏阅读视图（可折叠侧栏、状态徽章、字体大小调节）
- 「翻译本章」Banner → Worker → polling → 右列实时更新
- 发布项目 → 公开链接 → Reader 阅读视图
- 双语 / 纯译文模式切换
- 质量分展示 + 低分章节重译
- Playwright E2E 测试用例补充至已有 CI pipeline
- UI 响应式优化

---

## 非功能需求
- Next.js API Routes 作为 BFF，Python Worker 通过 REST 接受任务
- 所有持久化状态存 PostgreSQL（单一数据源）
- ChromaDB 仅作 Worker 本地 RAG 加速，不是 source of truth
- 核心模块 80%+ 测试覆盖率
- CI/CD：lint、typecheck、unit test、E2E（Playwright）、security scan、AI PR review、Vercel preview deploy
