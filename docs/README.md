# Daymark documentation · 文档索引

Documents are ordered from product definition to operations. The minimum
starting set is **01 → 05 → 06 → 04 → 02**; the rest can be written as the
corresponding area is built.

文档按“立项 → 设计 → 开发 → 测试 → 发布”排序。最小启动集是
**01 → 05 → 06 → 04 → 02**，其余可随开发进度补齐。

| # | Document | 文档 | Status |
|---|---|---|---|
| 01 | [Product requirements](01-prd.md) | 产品需求文档 | ✅ |
| 02 | [Functional specification](02-fsd.md) | 功能规格说明书 | ✅ |
| 03 | [User stories](03-user-stories.md) | 用户故事与验收标准 | ✅ |
| 04 | [Technical architecture](04-architecture.md) | 技术架构文档 | ✅ |
| 05 | [Data model](05-data-model.md) | 数据模型与存储设计 | ✅ |
| 06 | [Sync and conflict design](06-sync-conflict.md) | 同步与冲突处理设计 | ✅ |
| 07 | [CalDAV integration](07-caldav.md) | CalDAV 集成文档 | 🟡 design only |
| 08 | [Report template specification](08-report-templates.md) | 报告模板规范 | 🟡 first version |
| 09 | [Internationalisation](09-i18n.md) | 国际化规范 | ✅ |
| 10 | [Build and distribution](10-build-distribution.md) | 构建与分发 | ✅ |
| 11 | [Test plan](11-test-plan.md) | 测试计划 | ✅ |
| 12 | [Release checklist](12-release-checklist.md) | 发布检查清单 | ✅ |
| 13 | [Repository map](13-repository-map.md) | 文件结构与职责 | ✅ |
| 14 | [Interface reference](14-interface-reference.md) | 接口与权限契约 | ✅ |
| 15 | [User guide](15-user-guide.md) | 使用说明 | ✅ |
| 16 | [Data and sync operations](16-data-sync-operations.md) | 数据同步操作手册 | ✅ |
| 17 | [Troubleshooting](17-troubleshooting.md) | 故障排查 | ✅ |
| 18 | [Development guide](18-development-guide.md) | 开发指南 | ✅ |

Legend: ✅ implemented or directly reflected in code · 🟡 design agreed, code
incomplete.

## Reading paths · 阅读路径

| Role | Order |
|---|---|
| End user · 使用者 | 15 → 16 → 17 |
| New contributor · 新开发者 | 04 → 13 → 14 → 18 → 11 |
| Support / ops · 支持与运维 | 16 → 17 → 05 |
| Maintainer · 维护者 | 01 → 05 → 06 → 14 → 12 |
| Release manager · 发布负责人 | 10 → 11 → 12 → 18 |

## Maintenance rule · 维护规则

Code and documentation change together. A file added or moved updates doc 13; an
interface, command or permission change updates doc 14; a schema change updates
doc 05 and 14. Doc 18 §10 lists the full mapping.

代码与文档必须同一次提交更新：改文件结构更新 13，改接口/命令/权限更新 14，
改表结构更新 05 和 14。完整对应表见 18 §10。
