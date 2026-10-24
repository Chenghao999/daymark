# Daymark · 日迹

[![CI](https://github.com/Chenghao999/daymark/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/Chenghao999/daymark/actions/workflows/ci.yml)
[![Release](https://github.com/Chenghao999/daymark/actions/workflows/release.yml/badge.svg)](https://github.com/Chenghao999/daymark/actions/workflows/release.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
![Version](https://img.shields.io/badge/version-0.1.0-blue)
![Platform](https://img.shields.io/badge/platform-macOS%20%7C%20Windows-lightgrey)
![Storage](https://img.shields.io/badge/storage-Markdown-success)
![Tauri](https://img.shields.io/badge/Tauri-2-24C8DB?logo=tauri&logoColor=white)
![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)
![TypeScript](https://img.shields.io/badge/TypeScript-6-3178C6?logo=typescript&logoColor=white)
![Rust](https://img.shields.io/badge/Rust-stable-000000?logo=rust&logoColor=white)

**A local-first daily planner and automatic work-report generator.**
**本地优先的日计划工具与自动周报生成器。**

Daymark keeps every task in plain Markdown files that you own: one file per day
inside month folders, plus `_backlog.md`, `_categories.md` and `_settings.md`.
Put that folder in Nutstore, OneDrive, iCloud Drive, Syncthing or a WebDAV-synced
folder and the sync client you already use gives you multi-device sync — no
account, no server, no lock-in. If the app is ever unavailable, any text editor
can still read and edit your data.

Daymark 把所有任务放在属于你的纯 Markdown 文本里：按月份文件夹存放，每天一个
文件，另有 `_backlog.md`、`_categories.md` 和 `_settings.md`。把文件夹放进坚果云、
OneDrive、iCloud Drive、Syncthing 或支持 WebDAV 的目录，同步这件事交给同步盘本身
——不需要账号，不需要服务端，数据不会被锁在某个平台里。即使应用打不开，任何文本
编辑器仍然能读取和修改你的数据。

## Design principles · 设计原则

1. **Data sovereignty.** The data folder lives at a path you choose, in a format
   you can read. The app never requires a login or a cloud service. 数据主权在
   用户手里，格式永远可读。
2. **No silent conflict loss.** Two machines may edit the same file. Daymark
   detects external writes and never overwrites a newer version without telling
   you. 冲突不静默丢弃。
3. **Reports are derived.** Daily, weekly, monthly and yearly reports are
   generated from task and completion records, numbered by category. 报告是推导
   物，不是手写物。
4. **Modular by feature.** Storage, report periods, sync and AI are separate
   modules with narrow interfaces. 存储、周期、同步、AI 各自独立，不堆在一个文件里。

## Status

`0.1.0` — working skeleton on Markdown storage: day/week/month calendar
(Monday or Sunday start), task CRUD with backlog and completion states, category
presets and numbering, daily/weekly/monthly/yearly reports with configurable
assessment month/year and DOCX export, English-first UI with a full Chinese
translation (zh-CN / en), custom data
folder, synced settings file, external-change scanner, manual WebDAV sync
(first version), an opt-in AI assistant for report polish, retrospectives and
one-sentence task entry (Anthropic- or OpenAI-compatible endpoints, including
relays such as Oppo AI), light/dark/system appearance, and a one-time migration
from the old `daymark.db`.

`0.1.0` 已实现：Markdown 文件存储、日/周/月视图（周一或周日开头）、任务增删改与
完成状态、分类与报告编号、日报/周报/月报/年报（可自定义考核月与考核年）及 DOCX
导出、英文为主且中文完整可切换的界面、自定义数据目录、可同步的设置文件、
外部变更检测、手动 WebDAV 同步（第一版）、可选的 AI 报告润色、周期回顾与
一句话建任务（支持 Anthropic/OpenAI 兼容接口与中转）、浅色/深色/跟随系统外观，
以及从旧 `daymark.db` 的一次性迁移。

## Try it · 如何体验

```bash
npm ci
npm run app          # development window (Tauri + Vite, hot reload)
npm run app:build    # local installer under src-tauri/target/release/bundle/
```

Requirements: Node 22 and Rust stable; macOS also needs Xcode Command Line
Tools (`xcode-select --install`), Windows needs WebView2. On first launch,
choose an empty folder as the data folder.

Installers are built in CI by [`.github/workflows/release.yml`](.github/workflows/release.yml):
pushing a `v*` tag (or `npm run release`) builds macOS arm64/x64, Windows x64
and Linux x64 and drafts a GitHub Release. Builds are unsigned for now, so
macOS needs right-click → Open and Windows shows SmartScreen. Details:
[`docs/10-build-distribution.md`](docs/10-build-distribution.md) §7–8.

WebDAV sync is manual and deliberately conservative: it never deletes a file
and never overwrites a file changed on both sides — the remote copy is saved as
a `(conflict …)` file for you to merge. It has not yet been tested against every
WebDAV server. WebDAV 同步为手动、保守实现：不删除文件，两边同时改动时生成
冲突副本而不覆盖。

The AI assistant is opt-in and off by default. It can talk to an
Anthropic-compatible endpoint (including relays) or an OpenAI-compatible one;
the protocol, base URL and model name are all configurable, and the key stays
on this device. It sends only the selected report's title, period, categories
and task titles to the endpoint, shows the exact text before sending, and
writes nothing until you press Save (into a new file under `_ai/`). The same
assistant can also turn one sentence into a task — or several tasks at once:
the editor fills its fields (or you press “Create all”) and the save is still
yours. AI 助手默认关闭，接口协议、地址和模型都可配置（支持 Anthropic/OpenAI
兼容中转，如 Oppo AI），密钥只存本机。只发送所选报告的分类与任务标题，发送前可
预览，确认后才写入 `_ai/`；也可用一句话填好任务表单或一次创建多个任务，仍由你
确认保存。

Not implemented yet / 尚未实现：background WebDAV sync and in-app merge. They are
planned in [`docs/19-roadmap.md`](docs/19-roadmap.md); CalDAV and automatic
merge remain design-only in docs 06 and 07. Until automatic merge ships, only
one device should have Daymark open on a folder at a time.

## Data folder · 数据目录

```
<your folder>/
  _settings.md              # synced preferences (week start, assessment periods, language)
  _categories.md            # category names, colours, order
  _backlog.md               # tasks with no date
  2026-10/
    2026-10-22.md           # one day = one file
    2026-10-23.md
  _ai/                      # optional: saved AI answers (not synced by the app)
    2026-10-23-weekly-091500.md
```

A day file is readable on its own:

```markdown
# 2026-10-22

<!-- daymark file {"updatedAt":"2026-10-22T09:00:00.000Z","deviceId":"..."} -->

## Project work · 项目开发

- [ ] 09:00–10:00 写周报
  > 汇总本周进展
  <!-- daymark task {"id":"...","categoryId":"...","priority":2,"startAt":"2026-10-22T09:00","endAt":"2026-10-22T10:00","completedAt":null} -->
```

The HTML comments carry the fields a hand-edited file cannot express (IDs,
exact timestamps, device and version). Everything else is ordinary Markdown:
headings, checkboxes, blockquote notes. Unrecognised lines are preserved.

## Requirements · 环境要求

- Node.js 20+ and npm
- Rust (stable). Recommended on macOS:
  ```bash
  brew install rustup
  echo 'export PATH="/opt/homebrew/opt/rustup/bin:$PATH"' >> ~/.zshrc
  rustup toolchain install stable
  ```
  Other platforms: <https://rustup.rs>
- macOS: Xcode command line tools; Windows: WebView2 and the MSVC build tools

## Getting started · 快速开始

```bash
npm install
npm run app            # desktop app (alias: npm run tauri dev)
npm test               # unit tests (domain, storage, WebDAV, AI)
npm run typecheck      # TypeScript check
npm run build          # frontend production build
npm run app:build      # packaged installer (alias: npm run tauri build)
```

Rust changes should also pass `cargo check` inside `src-tauri/`.

On first launch, choose a folder. If the folder contains an old `daymark.db`,
Daymark migrates it to Markdown once, then renames the database to
`daymark.db.migrated-<timestamp>` instead of deleting it.

首次启动时选择一个文件夹。如果里面有旧的 `daymark.db`，Daymark 会先完整写出
Markdown，再把数据库改名为 `daymark.db.migrated-<时间戳>`，不会删除。

## Repository layout · 目录结构

```
src/
  domain/       pure logic: task state, report periods, report derivation, numbering
  storage/      Markdown parser/serializer, paths, repository, migration, settings file
  sync/         external-change scanner and manual WebDAV sync (scanner.ts, webdav/)
  settings/     device-local settings plus the synced subset written to _settings.md
  ai/           provider interface, prompt/context builders, Anthropic + OpenAI providers, _ai/ output
  features/     calendar views, reports, settings
  components/   task editor
  i18n/         zh-CN and en resources
src-tauri/      Tauri shell, filesystem and WebDAV commands, dialog/opener/sql plugins
docs/           product, engineering, usage, operations and roadmap documents
tests/          Vitest unit tests
```

The full file-by-file map and the “where does this change go” table are in
[`docs/13-repository-map.md`](docs/13-repository-map.md). Every module is used
through its exported interface, never through internal files: the caller map,
the public signatures and the single-module debugging workflow are in
[`docs/18-development-guide.md`](docs/18-development-guide.md) §4.1 and
[`docs/14-interface-reference.md`](docs/14-interface-reference.md).

## Testing · 测试

```bash
npm run verify          # typecheck + unit tests + production build
npm test                # Vitest once
npm run test:coverage   # V8 coverage report in coverage/
npm run test:watch      # watch mode
```

The Rust shell is checked separately:

```bash
cargo check --locked --manifest-path src-tauri/Cargo.toml
```

CI (`.github/workflows/ci.yml`) runs the frontend job on Ubuntu (typecheck,
tests with coverage, build) and `cargo check` on macOS for every push to `main`
and every pull request. The status badge above reflects the latest run.

## Documentation · 文档

[`docs/README.md`](docs/README.md) is the index. Start by role:

| I am… | Read |
|---|---|
| Using Daymark · 使用者 | [15 User guide](docs/15-user-guide.md) → [16 Sync operations](docs/16-data-sync-operations.md) → [17 Troubleshooting](docs/17-troubleshooting.md) |
| Developing · 开发者 | [13 Repository map](docs/13-repository-map.md) → [14 Interface reference](docs/14-interface-reference.md) → [18 Development guide](docs/18-development-guide.md) |
| Reviewing the design · 设计评审 | [01 PRD](docs/01-prd.md) → [02 FSD](docs/02-fsd.md) → [05 Data model](docs/05-data-model.md) → [06 Sync design](docs/06-sync-conflict.md) |
| Planning what's next · 规划 | [19 Roadmap](docs/19-roadmap.md) → [06 Sync design](docs/06-sync-conflict.md) → [07 CalDAV](docs/07-caldav.md) |
| Releasing · 发布 | [10 Build](docs/10-build-distribution.md) → [11 Test plan](docs/11-test-plan.md) → [12 Release checklist](docs/12-release-checklist.md) |

Code and documentation change together: file-structure changes update doc 13,
interface/permission changes update doc 14, and storage-format changes update
docs 05 and 14.

代码与文档同一次提交更新：改结构更新 13，改接口/权限更新 14，改存储格式更新 05 和 14。

## License

MIT — see [LICENSE](LICENSE).
