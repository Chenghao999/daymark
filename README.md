# Daymark · 日迹

**A local-first daily planner and automatic work-report generator.**
**本地优先的日计划工具与自动周报生成器。**

Daymark keeps every task in one SQLite file that you own. Put that file in
Nutstore, OneDrive, iCloud Drive, Syncthing or any WebDAV folder and the file's
own sync client gives you multi-device sync — no account, no server, no lock-in.

Daymark 把所有任务放在一个属于你的 SQLite 文件里。把文件放进坚果云、OneDrive、
iCloud Drive、Syncthing 或任意 WebDAV 目录，同步这件事交给同步盘本身——不需要账号，
不需要服务端，数据不会被锁在某个平台里。

## Design principles · 设计原则

1. **Data sovereignty.** The database lives at a path you choose; the app never
   requires a login or a cloud service. 数据主权在用户手里。
2. **No silent conflict loss.** Two machines may edit the same file. Daymark
   detects external writes and never overwrites a newer version without telling
   you. 冲突不静默丢弃。
3. **Reports are derived.** Daily, weekly and monthly reports are generated from
   task and completion records, numbered by category. 报告是推导物，不是手写物。

## Status

`0.1.0` — working skeleton: calendar (day/week/month), task CRUD with backlog
and completion states, category presets and numbering, derived reports with DOCX
export, bilingual UI (zh-CN / en), custom data path, external-change scanner.
CalDAV and automatic merge are designed but not implemented yet (see
`docs/06-sync-conflict.md` and `docs/07-caldav.md`). Until automatic merge
ships, only one device should have Daymark open on the database at a time.

`0.1.0` 已实现：日/周/月视图、任务增删改与完成状态、分类与报告编号、日报/周报/
月报及 DOCX 导出、中英文界面、自定义数据目录、外部变更检测。CalDAV 与自动合并
仅有设计。自动合并上线前，同一时间只应有一台设备打开数据库。

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
npm run tauri dev      # desktop app
npm test               # domain unit tests
npm run typecheck      # TypeScript check
npm run build          # frontend production build
npm run tauri build    # packaged app
```

Rust changes should also pass `cargo check` inside `src-tauri/`.

On first launch, choose a folder for `daymark.db`. Picking a folder inside a
synced directory is what enables multi-device use.

首次启动时选择一个存放 `daymark.db` 的文件夹。放进同步目录即可获得多设备能力。

## Repository layout · 目录结构

```
src/
  domain/       pure logic: task state machine, report derivation, numbering
  db/           SQLite schema, connection, repository
  sync/         external-change scanner (merge is P1)
  settings/     device-local preferences (localStorage)
  features/     calendar views, reports, settings
  components/   task editor
  i18n/         zh-CN and en resources
src-tauri/      Tauri shell, SQLite and dialog plugins, atomic file write
docs/           product, engineering, usage and operations documents
tests/          Vitest unit tests
public/         app mark
```

The full file-by-file map and the “where does this change go” table are in
[`docs/13-repository-map.md`](docs/13-repository-map.md).

## Documentation · 文档

[`docs/README.md`](docs/README.md) is the index. Start by role:

| I am… | Read |
|---|---|
| Using Daymark · 使用者 | [15 User guide](docs/15-user-guide.md) → [16 Sync operations](docs/16-data-sync-operations.md) → [17 Troubleshooting](docs/17-troubleshooting.md) |
| Developing · 开发者 | [13 Repository map](docs/13-repository-map.md) → [14 Interface reference](docs/14-interface-reference.md) → [18 Development guide](docs/18-development-guide.md) |
| Reviewing the design · 设计评审 | [01 PRD](docs/01-prd.md) → [02 FSD](docs/02-fsd.md) → [05 Data model](docs/05-data-model.md) → [06 Sync design](docs/06-sync-conflict.md) |
| Releasing · 发布 | [10 Build](docs/10-build-distribution.md) → [11 Test plan](docs/11-test-plan.md) → [12 Release checklist](docs/12-release-checklist.md) |

Code and documentation change together: file-structure changes update doc 13,
interface/permission changes update doc 14, schema changes update docs 05 and 14.

代码与文档同一次提交更新：改结构更新 13，改接口/权限更新 14，改表结构更新 05 和 14。

## License

MIT — see [LICENSE](LICENSE).
