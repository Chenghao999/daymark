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
`docs/06-sync-conflict.md` and `docs/07-caldav.md`).

## Requirements

- Node.js 20+ and npm
- Rust (stable) — install with <https://rustup.rs>
- macOS: Xcode command line tools; Windows: WebView2 and the MSVC build tools

## Getting started · 快速开始

```bash
npm install
npm run tauri dev      # desktop app
npm test               # domain unit tests
npm run build          # frontend production build
npm run tauri build    # packaged app
```

On first launch, choose a folder for `daymark.db`. Picking a folder inside a
synced directory is what enables multi-device use.

首次启动时选择一个存放 `daymark.db` 的文件夹。放进同步目录即可获得多设备能力。

## Repository layout · 目录结构

```
src/
  domain/       pure logic: task state machine, report derivation, numbering
  db/           SQLite schema and repository
  sync/         external-change scanner (merge is P1)
  features/     calendar views, reports, settings
  components/   task editor
  i18n/         zh-CN and en resources
src-tauri/      Tauri shell, SQLite and dialog plugins, atomic file write
docs/           product, architecture and operations documents
tests/          Vitest unit tests
```

## Documentation · 文档

Start with [`docs/README.md`](docs/README.md). The minimum reading set is
PRD → data model → sync design → architecture → FSD.

## License

MIT — see [LICENSE](LICENSE).
