# BookBridge Workflow Checklist

> 本文档依据 `HW-rubic/HW-rubics.md` Rubric（共 200 分）整理，每项均标注所属评分项及分值依据。
> 每项附有推荐时机，请在对应阶段完成后打勾。

---

## Application Quality（40 分）

> Rubric: *"Production-ready, deployed on Vercel, polished UI, 2+ user roles, real problem solved, portfolio-worthy"*

| 状态 | 要求 | Rubric 依据 | 推荐时机 |
|---|---|---|---|
| ⬜ | 生产就绪（Production-ready），UI 精良 | Application Quality 40pts | Sprint 4 |
| ⬜ | 2+ 用户角色或独立功能区域 | Functional Requirements: "2+ user roles or distinct feature areas" | Sprint 2–3 |
| ⬜ | 解决真实问题，portfolio 级别质量 | Functional Requirements: "Real-world use case, portfolio/interview-worthy" | Sprint 4 |
| ⬜ | 通过公开 URL 可访问（Vercel 部署） | Functional Requirements: "Deployed and accessible via public URL" | Sprint 2 |

---

## Architecture（Technical Requirements）

> Rubric: Technical Requirements → Architecture

| 状态 | 要求 | Rubric 依据 | 推荐时机 |
|---|---|---|---|
| ✅ | Next.js App Router 全栈应用 | Architecture: "Next.js full-stack application (App Router or Pages Router)" | Sprint 1 已确立 |
| ✅ | PostgreSQL 数据库 | Architecture: "Database (PostgreSQL recommended, or equivalent)" | Sprint 1 已确立 |
| ⬜ | 身份认证（Clerk 已选定） | Architecture: "Authentication (Auth.js/NextAuth, Clerk, or equivalent)" | Sprint 2 |
| ⬜ | 部署至 Vercel，支持 Preview Deploy | Architecture: "Deployed on Vercel (or equivalent platform with preview deploys)" | Sprint 2 |

---

## Claude Code Mastery（55 分）

> Rubric: *"Rich CLAUDE.md with @imports and git evolution; 2+ iterated skills with usage evidence; 2+ hooks enforcing quality; MCP server integrated via .mcp.json; agents with evidence; parallel worktree development; 2+ PRs with writer/reviewer + C.L.E.A.R. + AI disclosure"*

### CLAUDE.md & Memory（W10）

| 状态 | 要求 | Rubric 依据 | 推荐时机 |
|---|---|---|---|
| ✅ | Comprehensive CLAUDE.md，使用 @imports 模块化组织 | Claude Code Mastery: "Comprehensive CLAUDE.md with @imports for modular organization" | Sprint 1 已完成 |
| ✅ | CLAUDE.md 演进在 git history 中可见 | Claude Code Mastery: "Evidence of CLAUDE.md evolution across the project (visible in git history)" | 持续 |
| ✅ | 项目约定、架构决策、测试策略已文档化 | Claude Code Mastery: "Project conventions, architecture decisions, and testing strategy documented" | Sprint 1 已完成 |
| ⬜ | OWASP Top 10 awareness 记录在 CLAUDE.md | Security: "OWASP top 10 awareness documented in CLAUDE.md" | **Sprint 2 开始前** |
| ⬜ | Auto-memory 使用（session memory 有记录/截图） | Claude Code Mastery: "Auto-memory usage for persistent project context" | 持续，截止前截图留证 |

### Custom Skills（W12）— 最少 2 个，当前已有 3 个

| 状态 | 要求 | Rubric 依据 | 推荐时机 |
|---|---|---|---|
| ✅ | `tdd-add-module` skill v1→v2（已从 v1 迭代） | Custom Skills: "At least one skill iterated from v1 to v2 based on real usage" | Sprint 1 已完成 |
| ✅ | `start-issue` skill（fetch issue, create branch, print AC） | Custom Skills: "At least 2 skills in `.claude/skills/`" | Sprint 1 已完成 |
| ✅ | `create-pr` skill（quality checks, C.L.E.A.R. PR + AI disclosure） | Custom Skills: "At least 2 skills in `.claude/skills/`" | Sprint 1 已完成 |
| ⬜ | 所有 skill 均有团队使用证据（session log / 截图） | Custom Skills: "Evidence of team usage (session logs or screenshots)" | 持续收集 |

### Hooks（W12）— 最少 2 个

| 状态 | 要求 | Rubric 依据 | 推荐时机 |
|---|---|---|---|
| ⬜ | PreToolUse 或 PostToolUse hook（如 lint-on-edit、auto-format、block protected files） | Hooks: "At least one PreToolUse or PostToolUse hook" | **Sprint 2 开始前** |
| ⬜ | Stop hook（质量门控，如运行测试） | Hooks: "At least one quality-enforcement hook (e.g., Stop hook that runs tests)" | **Sprint 2 开始前** |
| ⬜ | 共至少 2 个 hook 配置在 `.claude/settings.json` | Hooks: "At least 2 hooks configured in `.claude/settings.json`" | **Sprint 2 开始前** |

### MCP Servers（W12）— 最少 1 个

| 状态 | 要求 | Rubric 依据 | 推荐时机 |
|---|---|---|---|
| ✅ | Glossary MCP server 已实现 | MCP Servers: "At least 1 MCP server integrated" | Sprint 1 已完成 |
| ⬜ | `.mcp.json` 配置文件提交至仓库 | MCP Servers: "Configuration shared via `.mcp.json` in repository" | **Sprint 2 开始前** |
| ⬜ | 开发工作流中有使用证据（session log / 截图） | MCP Servers: "Evidence of use in development workflow (session logs or screenshots)" | 持续收集 |

### Agents（W12-W13）— 最少 1 个，三选一

| 状态 | 要求 | Rubric 依据 | 推荐时机 |
|---|---|---|---|
| ⬜ | Sub-agents 在 `.claude/agents/`（如 security-reviewer、test-writer） | Agents: "Custom sub-agents in `.claude/agents/`" | **Sprint 2 开始前** |
| ⬜ | 有使用证据（session log / PR / 截图显示 agent 输出） | Agents: "Evidence of use (session log, PR, or screenshots showing agent output)" | 持续收集 |

> **替代选项**：Agent teams（`CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`）或 Agent SDK 内置到应用中（可得 Bonus +4 分）。
> **推荐**：先用 sub-agent 方式，定义 `security-reviewer.md` 和 `test-writer.md`，同时满足「Security SAST」要求。

### Parallel Development（W12）

| 状态 | 要求 | Rubric 依据 | 推荐时机 |
|---|---|---|---|
| ⬜ | 使用 git worktree 进行并行功能开发 | Parallel Development: "Evidence of worktree usage for parallel feature development" | **Sprint 3** |
| ⬜ | 至少 2 个 feature 并行开发（git branch history 可见） | Parallel Development: "At least 2 features developed in parallel (visible in git branch history)" | Sprint 3–4 |

### Writer/Reviewer Pattern + C.L.E.A.R.（W12）

| 状态 | 要求 | Rubric 依据 | 推荐时机 |
|---|---|---|---|
| ⬜ | 至少 2 个 PR 使用 writer/reviewer pattern（一个 agent 写，另一个审查） | Writer/Reviewer: "At least 2 PRs using the writer/reviewer pattern (one agent writes, another reviews)" | **Sprint 2 起每个 PR 都做** |
| ⬜ | PR review 中有 C.L.E.A.R. 框架（visible in PR comments） | Writer/Reviewer: "C.L.E.A.R. framework applied in PR reviews (visible in PR comments)" | 同上 |
| ⬜ | PR body 包含 AI disclosure metadata（% AI-generated、tool used、human review applied） | Writer/Reviewer: "AI disclosure metadata in PRs (% AI-generated, tool used, human review applied)" | 同上 |

> **推荐**：建 `.github/pull_request_template.md`，强制包含 AI disclosure 和 C.L.E.A.R. checklist，所有 PR 自动满足。

---

## Testing & TDD（30 分）

> Rubric: *"TDD red-green-refactor for 3+ features visible in git; 70%+ coverage; unit + integration + E2E (Playwright); tests verify behavior and edge cases"*

| 状态 | 要求 | Rubric 依据 | 推荐时机 |
|---|---|---|---|
| ⬜ | TDD red-green-refactor 用于 3+ 功能，git history 可见 failing test 先提交 | TDD: "TDD workflow (red-green-refactor) for at least 3 features; Git history showing failing tests committed before implementation" | 每个功能开发时 |
| ⬜ | Unit + integration tests（Vitest 或 Jest） | TDD: "Unit + integration tests (Vitest or Jest)" | Sprint 2 起 |
| ⬜ | 至少 1 个 E2E test（Playwright） | TDD: "At least 1 E2E test (Playwright)" | Sprint 4 |
| ⬜ | 70%+ 测试覆盖率 | TDD: "70%+ test coverage" | Sprint 4 前达到 |

---

## CI/CD Pipeline（35 分）— GitHub Actions

> Rubric: *"All 8 pipeline stages green (lint, typecheck, tests, E2E, security, AI review, preview, prod deploy); 4+ security gates; OWASP in CLAUDE.md"*

| 状态 | 阶段 | Rubric 依据 | 推荐时机 |
|---|---|---|---|
| ⬜ | Lint（ESLint + Prettier） | CI/CD: "Lint (ESLint + Prettier)" | **Sprint 2**（Next.js 初始化时） |
| ⬜ | Type checking（tsc --noEmit） | CI/CD: "Type checking (tsc --noEmit)" | **Sprint 2** |
| ⬜ | Unit / integration tests | CI/CD: "Unit and integration tests" | **Sprint 2** |
| ⬜ | E2E tests（Playwright） | CI/CD: "E2E tests (Playwright)" | Sprint 4 |
| ⬜ | Security scan（npm audit） | CI/CD: "Security scan (npm audit)" | **Sprint 2** |
| ⬜ | AI PR review（claude-code-action 或 claude -p） | CI/CD: "AI PR review (claude-code-action or claude -p)" | **Sprint 2** |
| ⬜ | Preview deploy（Vercel，每个 PR） | CI/CD: "Preview deploy (Vercel)" | **Sprint 2**（Vercel 连接后自动） |
| ⬜ | Production deploy on merge to main | CI/CD: "Production deploy on merge to main" | **Sprint 2** |

---

## Security Gates（35 分中的安全部分）— 最少 4 个

> Rubric: *"minimum 4 gates from the 8-gate pipeline"*

| 状态 | Gate | Rubric 依据 | 推荐时机 |
|---|---|---|---|
| ⬜ | Pre-commit secrets detection（Gitleaks 或同类工具） | Security: "Pre-commit secrets detection (Gitleaks or equivalent)" | **Sprint 2 开始前**（越早越好） |
| ⬜ | Dependency scanning（npm audit in CI） | Security: "Dependency scanning (npm audit in CI)" | Sprint 2 |
| ⬜ | SAST 工具 或 security-focused sub-agent | Security: "At least one SAST tool or security-focused sub-agent" | Sprint 2（sub-agent 同时满足 Agents 要求） |
| ⬜ | Security acceptance criteria in Definition of Done（写进 issue 模板） | Security: "Security acceptance criteria in Definition of Done" | **Sprint 2 开始前** |
| ⬜ | OWASP Top 10 awareness 记录在 CLAUDE.md | Security: "OWASP top 10 awareness documented in CLAUDE.md" | **Sprint 2 开始前** |

> **推荐**：`security-reviewer` sub-agent 同时满足「Agents」和「SAST 工具」两条要求，一石二鸟。

---

## Team Process（25 分）

> Rubric: *"2 sprints with planning + retrospectives; branch-per-issue with PR reviews; 3+ async standups/sprint/partner; C.L.E.A.R. in reviews; AI disclosure; thoughtful peer evaluation"*

| 状态 | 要求 | Rubric 依据 | 推荐时机 |
|---|---|---|---|
| ✅ | Sprint 1 retrospective 文档 | Team Process: "2 sprints documented (sprint planning + retrospective each)" | Sprint 1 已完成 |
| ⬜ | Sprint 2 planning 文档 | Team Process: "2 sprints documented" | Sprint 2 开始时 |
| ⬜ | Sprint 2 retrospective 文档 | Team Process: "2 sprints documented" | Sprint 2 结束时 |
| ⬜ | GitHub Issues 含可测试的 Acceptance Criteria | Team Process: "GitHub Issues with acceptance criteria as testable specifications" | **Sprint 2 起强制执行** |
| ⬜ | Branch-per-issue workflow，所有 PR 对应 issue，含 PR review | Team Process: "Branch-per-issue workflow with PR reviews" | **Sprint 2 起强制执行** |
| ⬜ | Async standups（每人每 sprint 至少 3 次，留存记录） | Team Process: "Async standups (minimum 3 per sprint per partner)" | 持续，每 sprint 至少 3 次 |
| ⬜ | C.L.E.A.R. framework 用于 PR reviews（PR comments 可见） | Team Process: "C.L.E.A.R. framework applied in PR reviews" | Sprint 2 起 |
| ⬜ | Peer evaluations | Team Process: "Peer evaluations" | 截止前提交 |

---

## Documentation & Demo（15 分）

> Rubric: *"Clear README with Mermaid architecture diagram; published blog post with AI workflow insights; polished 5-10 min video demo; 500-word reflections with specific Claude Code insights"*

| 状态 | 交付物 | Rubric 依据 | 推荐时机 |
|---|---|---|---|
| ⬜ | README 含 Mermaid 架构图 | Documentation: "Clear README with Mermaid architecture diagram" | Sprint 4 |
| ⬜ | Technical blog post 发布（Medium / dev.to） | Deliverables #4: "Technical blog post (published on Medium, dev.to, or similar)" | Sprint 4 结束后 |
| ⬜ | Video demo（5–10 min，展示 app + Claude Code workflow） | Deliverables #5: "Video demonstration (5-10 min, showcasing app + Claude Code workflow)" | Sprint 4 结束后 |
| ⬜ | Individual reflections（每人 500 words，含 Claude Code 具体见解） | Deliverables #6: "Individual reflections (one per partner, 500 words)" | 截止前提交 |
| ⬜ | GitHub repo 完整 `.claude/` 配置（skills, hooks, agents, MCP） | Deliverables #1: "GitHub repository with full `.claude/` configuration" | 截止前确认 |
| ⬜ | Vercel production URL | Deliverables #2: "Deployed application (Vercel production URL)" | Sprint 2 结束即可访问 |
| ⬜ | Showcase submission（Google Form：项目名、URL、缩略图、视频、博客） | Deliverables #7: "Showcase submission via Google Form" | 截止日当天 |

---

## Bonus（最多 +10 分）

> Rubric: *"Bonus (up to 10 extra points)"*

| 状态 | 要求 | Rubric 依据 | 推荐时机 |
|---|---|---|---|
| ⬜ | Property-based testing with fast-check | Bonus: "+3 pts" | Sprint 3–4 |
| ⬜ | Mutation testing with Stryker | Bonus: "+3 pts" | Sprint 3–4 |
| ⬜ | Agent SDK feature applying W13 patterns（内置到应用中） | Bonus: "+4 pts" | Sprint 3–4 |

---

## 评分汇总

| 类别 | 分值 | 对应章节 |
|---|---|---|
| Application Quality | 40 | Application Quality |
| Claude Code Mastery | 55 | Claude Code Mastery |
| Testing & TDD | 30 | Testing & TDD |
| CI/CD & Production | 35 | CI/CD Pipeline + Security Gates |
| Team Process | 25 | Team Process |
| Documentation & Demo | 15 | Documentation & Demo |
| **合计** | **200** | |
| Bonus | +10 | Bonus |

> **Note:** 个人成绩由 peer evaluations 调整（±10%）。
