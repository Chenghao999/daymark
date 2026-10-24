# 19 · Roadmap: WebDAV sync, AI assistant and the modular plan
# 19 · 路线图：WebDAV 同步、AI 助手与模块化开发计划

> Status: **partly implemented / 部分实现**。M0–M5 已落地（WebDAV 第一版见
> §3.8，AI 第一版见 §4.9，自然语言录入第一版见 §4.10）；自动合并与 CalDAV
> 仍是计划。已实现的模块以 01-18 号文档为准，本文只记录路线与取舍。
>
> 日期：2026-10-24。基线版本 `0.1.0`，存储已从 SQLite 切换为 Markdown 文本。

---

## 1. 总原则 · Principles

1. **文本优先（text-first）**：任何新能力都必须能以 Markdown 文件的形式读写，
   不能把数据锁进新的二进制容器或远端账号。AI 与同步只是“读写这些文本的
   另一种方式”，不是新的数据源。
2. **默认关闭、显式开启（opt-in）**：WebDAV 与 AI 都需要用户在设置里主动打开，
   并明确知道哪些数据会被发送到哪里。
3. **绝不静默覆盖（never silent overwrite）**：同步冲突保留两份文件；AI 的输出
   必须经用户确认后才写入，不自动改任务。
4. **模块化（modular by feature）**：每个能力一个目录、一个公开入口，UI 只依赖
   接口，不直接拼协议细节。避免把同步、AI、报告逻辑堆进 `App.tsx`。

---

## 2. 里程碑总览 · Milestones

| 里程碑 | 主题 | 依赖 | 交付物 |
|---|---|---|---|
| M0 | Markdown 存储 | — | 已完成：`src/storage/*`、`_settings.md`、迁移 |
| M1 | 自定义考核周期与年报 | M0 | 已完成：`src/domain/periods.ts`、年报页签 |
| M2 | 周起始日设置 | M0 | 已完成：`weekStartsOn`，日/周/月视图与周报共用 |
| M3 | WebDAV 同步 | M0、M2 | 第一版已完成：`src/sync/webdav/*`、设置页 “WebDAV sync” 卡片（见 §3.8） |
| M4 | AI 助手（报告润色 / 周回顾） | M0、M1 | 第一版已完成：`src/ai/*`、报告页 “AI assistant”（见 §4.9） |
| M5 | AI 自然语言录入 | M4 | 第一版已完成：`src/ai/tasks.ts`、任务编辑器 “Fill fields” 一句话填表（见 §4.10） |
| M6 | 自动合并与 CalDAV | M3 | 06/07 号文档的设计落地 |

顺序说明：M3 与 M4 相互独立，可并行；但两者都依赖 M0 的文件契约，因此
**先稳定 Markdown 格式，再接入外部能力**。M6 放在最后，因为自动合并需要
明确的冲突语义，而冲突语义应当由 WebDAV 同步先跑通。

---

## 3. WebDAV 同步 · WebDAV sync

### 3.1 目标

让用户把同一个数据文件夹同步到坚果云、Nextcloud、Synology、ownCloud 等
WebDAV 服务，而不依赖某一家桌面同步盘。桌面同步盘（iCloud、OneDrive、
坚果云客户端）仍然是首选方案；WebDAV 是“没有桌面客户端”时的补充。

### 3.2 远端布局

远端目录与本地完全一致，便于人工检查与迁移：

```
<webdav-root>/
  _settings.md
  _categories.md
  _backlog.md
  2026-10/2026-10-22.md
  2026-10/2026-10-23.md
```

不引入远端专用索引文件。文件本身就是索引；需要清单时在本地临时生成。

### 3.3 凭据与设置

| 字段 | 存放位置 | 是否同步 | 说明 |
|---|---|---|---|
| `webdavUrl` | 本地 localStorage | 否 | 每个设备可以指向不同服务 |
| `webdavUsername` | 本地 localStorage | 否 | |
| `webdavPassword` | 第一版：本地 localStorage（UI 已明示；后续版本迁移到系统钥匙串） | **绝不** | 不能写进 `_settings.md`，否则密码会随文件夹同步出去 |
| `webdavEnabled` | 本地 localStorage | 否 | 每台设备独立开关 |
| `webdavRemotePath` | 本地 localStorage | 否 | 远端根路径，默认 `/daymark/` |

设置页只显示“已配置 / 未配置”，不回显密码。

### 3.4 同步算法（第一版：手动“立即同步”）

1. **本地清单**：只读取 Daymark 的数据文件——根目录的 `_settings.md`、
   `_categories.md`、`_backlog.md`，以及 `YYYY-MM/YYYY-MM-DD.md`。得到
   `{path, sha256}` 和待上传的文本。
2. **远端清单**：`PROPFIND` 深度 1，再对每层目录做一次深度 1；随后逐个
   `GET` 文件并计算 `sha256`。任何远端文件读不到就中止，一个字节都不写。
3. **三方比较**：本地哈希、远端哈希和上次同步基线（每台设备本地保存）：
   - 仅一侧有 → `upload` / `download`
   - 两侧相同 → 跳过
   - 两侧不同、但只有一侧相对基线变化 → 变化的一侧胜出
   - 两侧都相对基线变化（或首次同步就不同）→ `conflict`
4. **执行**：
   - `upload`：`PUT` 到 `<name>.daymark-tmp`，再 `MOVE` 覆盖；服务器不支持
     `MOVE`（405/501）时退化为直接 `PUT`。
   - `download`：本地原子写入（`.tmp` + rename）。
   - `conflict`：**不覆盖任何一侧**。本地保留原名，远端版本写为
     `<name> (conflict <device8> <yyyyMMdd-HHmmss>).md`，并在设置页列出。
     基线不前进，所以合并后再同步前会一直报告同一冲突。
5. **不删除**：同步从不删除任何一侧的文件；一侧删除不会传播到另一侧。
6. **提交与刷新**：成功的路径更新基线；失败的路径保留旧基线，下次重试。
   有下载时调用 `reloadFromDisk()`，否则调用 `scanner.touch()`，避免把同步
   写回误判为外部修改。

第一版不做后台定时、不做 `If-Match` 条件请求、不做自动合并；用户点一次
“Sync now” 同步一次。第二版再加定时同步、ETag 条件请求与合并 UI。

### 3.5 模块划分

```
src/sync/webdav/
  client.ts      # PROPFIND/GET/PUT/MOVE/DELETE，认证与错误归一化
  manifest.ts    # 本地文件清单（复用 storage/fs 的 tree 遍历）
  plan.ts        # 纯函数：本地/远端清单 → 操作计划 + 冲突列表
  engine.ts      # 执行计划、写回、进度回调
  types.ts       # WebDavConfig, RemoteEntry, SyncPlan, SyncResult
```

UI 只调用 `engine.syncNow(config, root, onProgress)`。`plan.ts` 是纯函数，可
用 Vitest 覆盖，不需要真实服务器。

### 3.6 传输层选择

- 方案 A：Rust 侧 `reqwest` 实现命令 `webdav_request`，前端只传方法/路径/头。
  优点：不受 WebView CORS 限制；密码不进入 JS 内存。缺点：需要新增依赖与
  权限声明。
- 方案 B：`tauri-plugin-http` + 前端 `fetch`。开发快，但需要为每个域名配置
  能力，且凭据会出现在前端内存。

**建议 A**。在 `src-tauri` 增加 `webdav.rs`，只暴露最小命令面：
`webdav_propfind`, `webdav_get`, `webdav_put`, `webdav_move`。凭据来自系统
钥匙串（`keyring` crate）或一次性的命令参数；不写入日志。

### 3.7 验收标准

- 空远端 + 本地 3 个文件：上传后远端结构一致，内容逐字节相同。
- 远端手改一个任务标题 + 本地改另一个文件：同步后两边都保留，冲突清单为空。
- 两边改同一个文件：生成一个冲突副本，原名文件不被覆盖，UI 能看到两份。
- 断网、401、远端 507：错误可读，本地文件不损坏（临时文件 + rename）。
- 中文文件名、空格、`#`、`%`：URL 编码正确。

### 3.8 第一版实现状态 · Implementation status (first version)

已落地（2026-10-23）：

| 项目 | 结果 |
|---|---|
| 传输层 | `src-tauri/src/webdav.rs` 单个命令 `webdav_request`，`reqwest` + rustls，45 s 超时；HTTP 错误作为数据返回 |
| 前端模块 | `src/sync/webdav/{types,client,manifest,plan,baseline,engine}.ts`；设置保存在 `src/settings/webdav.ts` |
| UI | 设置页 “WebDAV sync” 卡片：地址、远端目录、账号、密码、Test connection、Sync now、进度、结果、冲突副本列表 |
| 判定 | 三方比较（本地 / 远端 / 基线），纯函数 `planSync`；**不删除、不静默覆盖** |
| 安全 | 密码只存本机 localStorage，绝不写入 `_settings.md`；Basic auth 只在填写用户名时发送 |
| 测试 | `webdavPlan`、`webdavClient`、`webdavManifest` 共 20 个单元测试；`npm run typecheck`、`npm run test`、`npm run build`、`cargo check` 全部通过 |

第一版边界（有意保留，不是缺陷）：

- 只同步 Daymark 认识的文件，不镜像用户放进文件夹的其他文件。
- 手动触发，没有后台定时、没有开机自动同步。
- 冲突只生成副本并列表，不在应用内提供合并编辑器。
- 尚未连接真实 WebDAV 服务做过端到端验收（§3.7 的清单仍需在
  坚果云 / Nextcloud 上手动跑一遍）；单元测试覆盖纯逻辑，不覆盖网络与
  各家服务器的 PROPFIND 差异。
- 密码在 localStorage，尚未迁移到系统钥匙串。

下一步（M3 第二版）：钥匙串存储、`If-Match`/ETag 防覆盖、定时同步、
本地 `rclone serve webdav` 集成测试。

---

## 4. AI 助手 · AI assistant

### 4.1 目标与非目标

**目标**：把“记录 → 报告”的最后一步做得更省力。

- 周报/月报的**文字润色**：把已生成的条目整理成连贯段落。
- **周回顾**：根据完成记录提示“本周完成了什么、哪些顺延了”。
- **自然语言录入**：一句话拆成任务、日期、分类（M5）。
- **计划建议**：根据待办与历史耗时给出排期建议（更后期）。

**非目标**：不做自动改任务、不做云端账号体系、不把整个数据目录无差别上传。

### 4.2 隐私模型

1. 默认关闭。开启时显示一段说明：请求会发送到用户配置的模型服务商。
2. **自带密钥（BYO key）**：第一版存在本机 localStorage（UI 明示），后续迁移
   到系统钥匙串；不写入 `_settings.md`，不随文件夹同步。
3. **按需组装上下文**：只发送当前报告周期内的报告标题、周期、分类名、任务
   标题和日期；**不发送备注、任务 ID、设备 ID、本地路径或历史全部文件**。
4. **发送前预览**：面板始终显示“本次将发送 N 个分类、M 个条目、约 K 字符”，
   并可展开查看即将发送的完整文本；用户点“生成”后才请求。
5. **输出不自动落盘**：AI 结果先出现在可编辑的面板，用户点“保存到 `_ai/`”才
   写文件，文件名为 `_ai/YYYY-MM-DD-<kind>-HHmmss.md`，不覆盖旧结果。

### 4.3 技术选型

- 官方 SDK：`@anthropic-ai/sdk`（TypeScript），默认模型 `claude-opus-5-5`。
- 使用自适应思考 `thinking: {type: "adaptive"}`；报告润色与结构化拆解都属于
  需要推理的任务。
- 长报告使用流式请求，避免超时；用 `stream.finalMessage()` 取完整结果。
- 需要严格 JSON（如自然语言拆任务）时使用 structured outputs
  （`output_config.format`），不要靠提示词“请只返回 JSON”。
- 兼容层：`AiProvider` 接口允许以后接入本地模型（Ollama / LM Studio）或
  企业网关；第一版只实现 Anthropic，其他 provider 明确标注“未实现”。

### 4.4 模块划分

第一版实际结构（`4.9` 记录与计划的差异）：

```
src/ai/
  types.ts             # AiProvider, AiRequest, AiResult, AiFeature, AiConfig, AiJsonSchema
  context.ts           # 纯函数：ReportDocument → 将要发送的 Markdown 文本
  prompts.ts           # 纯函数：AiRequest → {system, user}
  tasks.ts             # 纯函数：一句话 → 提示词 / schema / 校验后的任务建议
  providers/
    anthropic.ts       # 官方 SDK；首次调用时动态加载
  output.ts            # 保存到 _ai/ 的唯一入口
  index.ts             # createAiProvider + 公开导出
```

自然语言录入（M5）没有另建 `prompts/parseTask.ts`：它和报告功能共用
`AiPrompt`，所以放在同一个 `tasks.ts` 里，UI 仍只依赖 `index.ts` 的公开接口，
不直接 new SDK client。`context.ts`、`prompts.ts`、`tasks.ts` 的组装是纯函数，
可用固定样本做单元测试，不需要真实 API。

### 4.5 第一阶段功能：报告润色

输入：`ReportDocument`（标题、周期、分类、条目、完成数）。
输出：一段中文/英文正文，保留分类顺序，不新增事实。

约束写入 system prompt：

- 只使用输入中出现的任务，不虚构数字、人名、项目名。
- 保留原始条目作为“事实来源”；润色只是组织语言。
- 输出语言跟随 `settings.language`。
- 长度上限（如 600 字）可配置。

UI：报告页新增“AI 润色”按钮 → 侧栏预览 → “复制” / “插入报告备注” /
“另存为 `_ai/` 文件”。原文始终保留。

### 4.6 第二阶段：自然语言录入（M5）

示例输入：“下周三下午三点和张总开会，准备报价单，提前一天提醒”。

流程：

1. `parseTask.ts` 组装当前日期、时区、分类列表。
2. 调用模型，使用 structured outputs 返回
   `{title, startAt, endAt, dueAt, categoryId, priority, notes}[]`。
3. 前端用 `zod` 或手写校验器验证：日期可解析、分类 ID 存在、标题非空。
4. 打开任务编辑器预填，用户确认后才调用 `createTask`。

绝不直接写文件；解析失败时展示原始模型输出并允许手动修正。

### 4.7 成本、离线与失败处理

- 在设置里显示“本次请求约 X 输入 / Y 输出 token”的估算，不做硬性承诺。
- 请求失败（401、429、超时）不影响本地数据；显示可重试的错误。
- 离线时按钮禁用并提示“需要网络”。
- 不在日志中记录密钥、完整请求体或任务备注；只记录功能名、耗时、token 数。

### 4.8 验收标准

- 未配置密钥时，AI 按钮可见但点击后引导去设置，不发请求。
- 预览阶段取消，不产生任何文件改动。
- 润色结果不包含输入中不存在的任务。
- 自然语言录入解析出的日期落在用户本地时区，跨月/跨年正确。
- 关闭 AI 后，所有网络请求停止，代码路径不触发 SDK。

### 4.9 第一版实现状态 · Implementation status (first version)

已落地（2026-10-23）：

| 项目 | 结果 |
|---|---|
| 提供商 | `AiProvider` 接口；`AnthropicProvider` 使用官方 `@anthropic-ai/sdk`，`claude-opus-5-5` 默认模型、自适应思考、流式请求、`finalMessage()`；SDK 动态导入，不进启动包 |
| 上下文 | 纯函数 `reportOutline` / `buildPrompt`；只含报告标题、周期、计数、分类名、任务标题与日期 |
| 隐私 | 默认关闭；面板显示条目数与字符数，并可展开预览完整发送文本；密钥只存本机 localStorage |
| 输出 | 结果可编辑；只有点“保存到 `_ai/`”才写入 `_ai/YYYY-MM-DD-<kind>-HHmmss.md`，不覆盖旧文件；`_ai/` 不参与 WebDAV 同步 |
| UI | 设置页 “AI assistant” 卡片（开关、密钥、模型）；报告页 “AI assistant” 按钮 → 润色 / 周期回顾 |
| 测试 | `aiPrompt`、`aiSettings` 共 12 个单元测试；typecheck、build 通过 |

与计划/验收标准的差异：

- 未配置密钥时按钮**不显示**，而不是“可见但点击后引导去设置”。设置页卡片
  始终显示，说明如何启用。
- 密钥在 localStorage，尚未进入系统钥匙串。
- **没有用真实 API 密钥做过端到端调用**（无可用密钥）；提示词组装、设置解析、
  输出路径有单元测试，SDK 调用的网络路径未验证。首次使用请在设置页配置密钥后，
  用一份小报告试跑并检查结果与计费。
- 尚未记录 token 用量或费用估算（§4.7）。

下一步（M4 第二版）：钥匙串存储、token/费用估算、离线检测与重试、把润色结果
插入报告导出而不是只写 `_ai/`。

### 4.10 M5 第一版实现状态 · Natural-language task entry (first version)

已落地（2026-10-24）：

| 项目 | 结果 |
|---|---|
| 入口 | 任务编辑器顶部 “Describe it in one sentence / 用一句话描述” → **Fill fields / 填充表单**；仅当 AI 已启用且填了密钥时出现 |
| 结构 | `TASK_SUGGESTION_SCHEMA` 交给 Anthropic structured outputs（`completeJson`），不靠提示词“只返回 JSON” |
| 上下文 | `buildTaskPrompt` 只发送当前本地时间（含星期）、界面语言、分类 `id → name` 列表和那句话；不发送已有任务或备注 |
| 校验 | `parseTaskResponse` 逐项检查：真实日期、`HH:mm` 范围、全天任务只留日期、结束不得早于开始、分类 id 必须存在、优先级只能是 0–3、标题为空则丢弃、最多 10 条 |
| 行为 | 只**填表**：结果写进编辑器的标题、分类、开始/结束/截止、优先级、全天与备注，用户确认后照常点保存；绝不自动创建任务 |
| 多任务 | 一句话拆出多条时列出按钮让用户选一条，不会全部套用 |
| 失败 | JSON 结构错误、没有任务、网络错误都在表单内显示，编辑器原内容不变 |
| 测试 | `tests/aiTasks.test.ts` 15 个单元测试；总测试 85 个，typecheck 与 build 通过 |

与计划/验收标准的差异：

- 没有引入 `zod`：结构化输出已保证形状，`parseTaskResponse` 手写校验足够，
  少一个运行时依赖。
- 解析失败时只显示错误信息，**没有**展示原始模型输出（模型输出是 JSON，
  对用户意义不大；调试时可在控制台观察）。
- 没有“提前一天提醒”这类提醒能力：数据模型还没有提醒字段，提示词也不会
  假装支持；`dueAt` 只表示截止日期。
- 同样**没有用真实 API 密钥做过端到端调用**；提示词、schema 与校验逻辑有
  单元测试覆盖，网络路径未验证。

下一步（M5 第二版）：多任务一次性批量创建、把相对时间解析结果高亮给用户确认、
支持 `reminders` 字段后再处理“提前提醒”。

---

## 5. Web 版 / PWA 的可行性 · Web build (optional)

用户提到的 “webdev” 若指浏览器版本，则单独评估，不与 WebDAV 混为一谈：

- Tauri 前端本身是 React + Vite，可以构建为静态站点。
- 文件访问需改用 File System Access API（Chromium）或导入/导出 zip；
  Safari/Firefox 支持不完整。
- 没有 Tauri 的原子 rename 与任意路径访问，`_settings.md` 的自动写回需要
  用户授权目录。
- 结论：**桌面端稳定后再做**；第一版最多提供“只读预览 + 导出”，不承诺完整
  编辑。若只是想要 WebDAV，按第 3 节执行即可。

---

## 6. 模块化与代码边界 · Modular boundaries

| 目录 | 只做一件事 | 不允许 |
|---|---|---|
| `src/domain/` | 纯计算：任务状态、周期、报告、编号 | 文件 IO、React、网络 |
| `src/storage/` | Markdown 解析/序列化、路径、仓库、迁移 | UI 状态、网络 |
| `src/sync/` | 检测变化；WebDAV 传输与计划 | 直接改 React state |
| `src/ai/` | 上下文组装、provider、prompt、动作 | 直接写文件 |
| `src/features/` | 页面与交互 | 协议细节、文件格式细节 |
| `src/settings/` | 设置类型、校验、本地持久化 | 业务规则 |
| `src-tauri/` | 文件系统、钥匙串、WebDAV 传输 | 业务判断 |

新增功能时先问“它属于哪一层”，再建目录；不要继续把逻辑堆进 `App.tsx`。
`App.tsx` 只负责组装：打开 store、刷新数据、切换视图、调用 action。

---

## 7. 测试与发布门槛 · Testing and release gates

每个里程碑合并前必须满足：

1. `npm run typecheck`、`npm test`、`npm run build` 全绿。
2. 新增纯函数有单元测试（周期、计划生成、上下文裁剪、解析校验）。
3. `cargo check` 通过；新增 Rust 命令在 14 号文档登记。
4. 手动验收覆盖：首次启动、迁移、断电/断网、冲突、中文路径。
5. 文档同批更新：05（格式）、06（同步）、14（接口）、15（使用）、17（排障）。

WebDAV 的集成测试使用本地 `rclone serve webdav` 或 Docker 的
`bytemark/webdav`，不连接真实云盘；测试账号与密码只存在于测试环境变量。

AI 的测试不调用真实 API：`AiProvider` 用假实现返回固定文本/JSON，验证
上下文组装、预览流程与失败分支。

---

## 8. 风险与待决事项 · Risks and open questions

| 风险 | 影响 | 缓解 |
|---|---|---|
| Markdown 被同步盘部分写入 | 文件损坏 | 原子写 + 临时文件；解析失败时保留原文并提示 |
| 两端同时改同一文件 | 数据丢失 | 冲突副本，绝不覆盖；后续做行级合并 |
| WebDAV 服务差异（坚果云/Nextcloud） | 同步失败 | 只依赖 PROPFIND/GET/PUT/MOVE；错误码归一化；集成测试覆盖两家 |
| 钥匙串在 Linux 缺失 | 密钥无处存放 | 退化为“每次会话输入”，不落盘 |
| AI 输出包含虚构内容 | 报告失真 | 只传输事实条目；提示词禁止新增；预览确认 |
| API 费用不可控 | 用户成本 | 显示估算、限制上下文、按功能开关 |
| 模型/接口变化 | 维护成本 | `AiProvider` 隔离；SDK 版本锁定；错误可降级 |

待决：

1. WebDAV 第一版是否支持自签证书？（建议：不支持，提示用户用系统信任的证书）
2. AI 默认 provider 是否只做 Anthropic，还是同时做 OpenAI-compatible？
   （建议：先 Anthropic，接口留好扩展点）
3. `_ai/` 输出目录是否纳入 `.gitignore` 之外的同步范围？（建议：纳入同步，
   但 UI 明示这些是生成物，可随时删除）

---

## 9. 参考 · References

- 05 数据模型：Markdown 文件格式与字段
- 06 同步与冲突：当前扫描器与未来合并策略
- 14 接口参考：现有 Rust 命令与 TS 模块
- 18 开发指南：验证命令与文档更新规则
- Anthropic TypeScript SDK：<https://github.com/anthropics/anthropic-sdk-typescript>
- WebDAV RFC 4918：<https://www.rfc-editor.org/rfc/rfc4918>
