import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { addDays, format, startOfWeek } from "date-fns";
import { enUS } from "date-fns/locale/en-US";
import { zhCN } from "date-fns/locale/zh-CN";
import type { AppLanguage, Category, NumberingStyle, Task } from "./domain/types";
import { closeStore, deviceId as readDeviceId, openStore } from "./storage/client";
import {
  archiveCategory,
  completeTask,
  createCategory,
  createTask,
  detachExternalTask,
  listCategories,
  listTasks,
  reopenTask,
  softDeleteTask,
  updateTask,
} from "./storage/repository";
import { loadSyncedSettings, saveSyncedSettings } from "./storage/settingsFile";
import { loadSettings, sanitize, saveSettings, type AppSettings } from "./settings/store";
import { loadAiSettings, saveAiSettings } from "./settings/ai";
import {
  isWebDavConfigured,
  loadWebDavSettings,
  normalizeWebDavSyncMinutes,
  saveWebDavSettings,
} from "./settings/webdav";
import type { AiConfig } from "./ai/types";
import { startFolderScanner, type FolderScanner } from "./sync/scanner";
import { WebDavClient } from "./sync/webdav/client";
import { syncWebDav } from "./sync/webdav/engine";
import { resolveConflict } from "./sync/webdav/resolve";
import type { SyncConflict, WebDavConfig } from "./sync/webdav/types";
import type { MergeDecisions } from "./sync/merge";
import {
  isCalDavConfigured,
  isCalDavReady,
  loadCalDavSettings,
  normalizeRefreshMinutes,
  saveCalDavSettings,
} from "./settings/caldav";
import { CalDavClient } from "./sync/caldav/client";
import { syncCalDav } from "./sync/caldav/engine";
import { seriesUidOf } from "./sync/caldav/import";
import type {
  CalDavCalendar,
  CalDavConfig,
  CalDavSettings,
} from "./sync/caldav/types";
import TaskEditor, { type TaskDraft } from "./components/TaskEditor";
import WeekView from "./features/calendar/WeekView";
import DayView from "./features/calendar/DayView";
import MonthView from "./features/calendar/MonthView";
import ReportsView from "./features/reports/ReportsView";
import SettingsView from "./features/settings/SettingsView";

type View = "day" | "week" | "month" | "reports" | "settings";

export default function App() {
  const { t, i18n } = useTranslation();
  const [settings, setSettings] = useState<AppSettings>(() => loadSettings());
  const [ready, setReady] = useState(false);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [view, setView] = useState<View>("week");
  const [anchor, setAnchor] = useState<Date>(() => new Date());
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<Task | null>(null);
  const [draftDate, setDraftDate] = useState<Date | null>(null);
  const [conflict, setConflict] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [webdav, setWebdav] = useState<WebDavConfig>(() => loadWebDavSettings());
  const [webdavBusy, setWebdavBusy] = useState(false);
  const [webdavStatus, setWebdavStatus] = useState<string | null>(null);
  const [webdavConflicts, setWebdavConflicts] = useState<SyncConflict[]>([]);
  const webdavBusyRef = useRef(false);
  const webdavSyncRef = useRef<(() => Promise<void>) | null>(null);
  /** Data folder whose launch sync already ran this session. */
  const webdavLaunchedRef = useRef<string | null>(null);
  const [ai, setAi] = useState<AiConfig>(() => loadAiSettings());
  const [caldav, setCaldav] = useState<CalDavSettings>(() => loadCalDavSettings());
  const [caldavBusy, setCaldavBusy] = useState(false);
  const [caldavStatus, setCaldavStatus] = useState<string | null>(null);
  const [caldavFound, setCaldavFound] = useState<CalDavCalendar[] | null>(null);
  const caldavBusyRef = useRef(false);
  const caldavSyncRef = useRef<(() => Promise<void>) | null>(null);
  const caldavLaunchedRef = useRef(false);
  const bootedRef = useRef(false);
  const scannerRef = useRef<FolderScanner | null>(null);

  const language = settings.language;
  const dateLocale = language === "zh-CN" ? zhCN : enUS;

  const refresh = useCallback(async () => {
    const [nextTasks, nextCategories] = await Promise.all([listTasks(), listCategories()]);
    setTasks(nextTasks);
    setCategories(nextCategories);
  }, []);

  /**
   * Adopt settings that may have come from `_settings.md`: persist them
   * locally and keep i18next in step, since the file can change the language
   * on a device that has not restarted.
   */  const adoptSettings = useCallback(
    (next: AppSettings) => {
      saveSettings(next);
      setSettings(next);
      if (i18n.language !== next.language) void i18n.changeLanguage(next.language);
    },
    [i18n],
  );

  const activateFolder = useCallback(
    async (dir: string) => {
      try {
        await openStore(dir);
        const synced = await loadSyncedSettings(dir);
        const next = sanitize({ ...settings, dataDir: dir, ...(synced ?? {}) });
        adoptSettings(next);
        if (!synced) await saveSyncedSettings(dir, next);
        await refresh();
        setReady(true);
        setError(null);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : String(cause));
      }
    },
    [adoptSettings, refresh, settings],
  );

  useEffect(() => {
    if (bootedRef.current) return;
    bootedRef.current = true;
    if (!settings.dataDir) return;
    void (async () => {
      try {
        await openStore(settings.dataDir);
        const synced = await loadSyncedSettings(settings.dataDir);
        if (synced) {
          adoptSettings(sanitize({ ...settings, ...synced }));
        } else {
          await saveSyncedSettings(settings.dataDir, settings);
        }
        await refresh();
        setReady(true);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : String(cause));
      }
    })();
  }, [adoptSettings, refresh, settings]);

  // Theme is device-local: "system" follows the OS, while light/dark pin it.
  // The attribute wins over the media query in App.css.
  useEffect(() => {
    const root = document.documentElement;
    if (settings.theme === "system") root.removeAttribute("data-theme");
    else root.setAttribute("data-theme", settings.theme);
  }, [settings.theme]);

  // The settings file lives in the data folder so it travels with the
  // Markdown. The first run after opening a folder is skipped because the
  // folder was just written by activateFolder/boot; later edits write it.
  const settingsWriteReady = useRef(false);
  useEffect(() => {
    if (!ready || !settings.dataDir) return;
    if (!settingsWriteReady.current) {
      settingsWriteReady.current = true;
      return;
    }
    // Debounce: the report signature field changes on every keystroke.
    const timer = window.setTimeout(() => {
      void saveSyncedSettings(settings.dataDir, settings)
        .then(() => scannerRef.current?.touch())
        .catch(() => undefined);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [ready, settings]);

  useEffect(() => {
    if (!ready) return;
    scannerRef.current?.stop();
    const scanner = startFolderScanner({
      rootPath: settings.dataDir,
      intervalMs: Math.max(10, settings.scanIntervalSec) * 1000,
      onExternalChange: () => setConflict(true),
    });
    scannerRef.current = scanner;
    return () => {
      scanner.stop();
      scannerRef.current = null;
    };
  }, [ready, settings.dataDir, settings.scanIntervalSec]);

  // Keep the timer pointed at the latest closure, so an import triggered by
  // the interval sees the current credentials, calendars and import cursor.
  useEffect(() => {
    caldavSyncRef.current = runCalDavSync;
  });

  // Optional automatic import while the app is open. It is deliberately not a
  // background service: closing the window stops it, and the setting is off
  // by default.
  useEffect(() => {
    if (!ready || caldav.refreshMinutes <= 0 || !isCalDavReady(caldav.config)) return;
    const timer = window.setInterval(() => {
      if (!caldavBusyRef.current) void caldavSyncRef.current?.();
    }, caldav.refreshMinutes * 60_000);
    return () => window.clearInterval(timer);
  }, [ready, caldav.refreshMinutes, caldav.config]);

  // One import at startup, so a short session still picks up calendar changes.
  // It runs at most once per session, after the store is ready.
  useEffect(() => {
    if (!ready || !caldav.importOnLaunch || !isCalDavReady(caldav.config)) return;
    if (caldavLaunchedRef.current) return;
    caldavLaunchedRef.current = true;
    if (!caldavBusyRef.current) void caldavSyncRef.current?.();
  }, [ready, caldav.importOnLaunch, caldav.config]);

  // WebDAV works the same way: the latest closure, an opt-in interval, and one
  // sync at a time. Closing the window stops automatic syncs.
  useEffect(() => {
    webdavSyncRef.current = runWebdavSync;
  });

  useEffect(() => {
    if (!ready || !settings.dataDir) return;
    if (webdav.autoSyncMinutes <= 0 || !isWebDavConfigured(webdav)) return;
    const timer = window.setInterval(() => {
      if (!webdavBusyRef.current) void webdavSyncRef.current?.();
    }, webdav.autoSyncMinutes * 60_000);
    return () => window.clearInterval(timer);
  }, [ready, settings.dataDir, webdav]);

  // The optional startup sync runs once per data folder per session. Keeping
  // the folder in the guard means switching folders can sync the new one,
  // while ordinary settings edits do not start extra syncs.
  useEffect(() => {
    if (!ready || !settings.dataDir) return;
    if (!webdav.syncOnLaunch || !isWebDavConfigured(webdav)) return;
    if (webdavLaunchedRef.current === settings.dataDir) return;
    webdavLaunchedRef.current = settings.dataDir;
    if (!webdavBusyRef.current) void webdavSyncRef.current?.();
  }, [ready, settings.dataDir, webdav]);

  async function chooseFolder() {
    const picked = await openDialog({ directory: true, multiple: false, title: t("onboarding.choose") });
    if (typeof picked === "string") await activateFolder(picked);
  }

  async function reloadFromDisk() {
    try {
      closeStore();
      await openStore(settings.dataDir);
      const synced = await loadSyncedSettings(settings.dataDir);
      if (synced) {
        adoptSettings(sanitize({ ...settings, ...synced }));
      }
      await refresh();
      setConflict(false);
      await scannerRef.current?.touch();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }

  const touchScanner = useCallback(async () => {
    await scannerRef.current?.touch();
  }, []);

  async function saveDraft(draft: TaskDraft) {
    if (editing) {
      const next: Task = {
        ...editing,
        title: draft.title,
        notes: draft.notes,
        categoryId: draft.categoryId,
        startAt: draft.startAt,
        endAt: draft.endAt,
        dueAt: draft.dueAt,
        priority: draft.priority,
        allDay: draft.allDay,
        status: draft.startAt || draft.dueAt ? "scheduled" : "backlog",
      };
      await updateTask(next);
    } else {
      await createTask(draft);
    }
    setEditorOpen(false);
    setEditing(null);
    setDraftDate(null);
    await refresh();
    await touchScanner();
  }

  async function createDrafts(drafts: TaskDraft[]) {
    for (const draft of drafts) {
      await createTask(draft);
    }
    setEditorOpen(false);
    setEditing(null);
    setDraftDate(null);
    await refresh();
    await touchScanner();
  }

  async function toggleTask(task: Task) {
    // Calendar events are read-only until the user turns them into a local task.
    if (task.source === "caldav") return;
    if (task.status === "done") await reopenTask(task);
    else await completeTask(task);
    await refresh();
    await touchScanner();
  }

  async function deleteTask(task: Task) {
    await softDeleteTask(task.id);
    setEditorOpen(false);
    setEditing(null);
    await refresh();
    await touchScanner();
  }

  async function detachTask(task: Task) {
    const series = seriesUidOf(task.externalUid);
    await detachExternalTask(task.id);
    if (series) {
      setCaldav((current) => {
        if (current.ignoredUids.includes(series)) return current;
        const next = { ...current, ignoredUids: [...current.ignoredUids, series] };
        saveCalDavSettings(next);
        return next;
      });
    }
    setEditorOpen(false);
    setEditing(null);
    await refresh();
    await touchScanner();
  }

  async function changeLanguage(next: AppLanguage) {
    await i18n.changeLanguage(next);
    patchSettings({ language: next });
  }

  const patchSettings = useCallback((patch: Partial<AppSettings>) => {
    setSettings((current) => {
      const next = { ...current, ...patch };
      saveSettings(next);
      return next;
    });
  }, []);

  const patchAi = useCallback((patch: Partial<AiConfig>) => {
    setAi((current) => {
      const next = { ...current, ...patch };
      saveAiSettings(next);
      return next;
    });
  }, []);

  const patchWebdav = useCallback((patch: Partial<WebDavConfig>) => {
    setWebdav((current) => {
      const next = { ...current, ...patch };
      saveWebDavSettings(next);
      return next;
    });
  }, []);

  const setWebdavAutoSync = useCallback((minutes: number) => {
    setWebdav((current) => {
      const next = { ...current, autoSyncMinutes: normalizeWebDavSyncMinutes(minutes) };
      saveWebDavSettings(next);
      return next;
    });
  }, []);

  const setWebdavSyncOnLaunch = useCallback(
    (enabled: boolean) => {
      setWebdav((current) => {
        const next = { ...current, syncOnLaunch: enabled };
        saveWebDavSettings(next);
        return next;
      });
    },
    [],
  );

  const patchCalDav = useCallback((patch: Partial<CalDavConfig>) => {
    // Calendars belong to a server; a new URL invalidates the old selection
    // and the discovery list, so they are not synced by mistake.
    if ("serverUrl" in patch) setCaldavFound(null);
    setCaldav((current) => {
      const config = { ...current.config, ...patch };
      if ("serverUrl" in patch && patch.serverUrl !== current.config.serverUrl) {
        config.calendars = [];
      }
      const next = { ...current, config };
      saveCalDavSettings(next);
      return next;
    });
  }, []);

  const setCalDavRefresh = useCallback((minutes: number) => {
    setCaldav((current) => {
      const next = { ...current, refreshMinutes: normalizeRefreshMinutes(minutes) };
      saveCalDavSettings(next);
      return next;
    });
  }, []);

  const setCalDavImportOnLaunch = useCallback((enabled: boolean) => {
    setCaldav((current) => {
      const next = { ...current, importOnLaunch: enabled };
      saveCalDavSettings(next);
      return next;
    });
  }, []);

  const toggleCalDavCalendar = useCallback((calendar: CalDavCalendar, selected: boolean) => {
    setCaldav((current) => {
      const others = current.config.calendars.filter((item) => item.href !== calendar.href);
      const calendars = selected
        ? [...others, { href: calendar.href, name: calendar.name }]
        : others;
      const next = { ...current, config: { ...current.config, calendars } };
      saveCalDavSettings(next);
      return next;
    });
  }, []);

  async function discoverCalDavCalendars() {
    if (!isCalDavConfigured(caldav.config)) {
      setCaldavStatus(t("settings.caldavNotConfigured"));
      return;
    }
    setCaldavBusy(true);
    setCaldavStatus(t("settings.caldavDiscovering"));
    try {
      const found = await new CalDavClient(caldav.config).discover();
      setCaldavFound(found);
      setCaldavStatus(
        found.length > 0 ? t("settings.caldavDiscovered") : t("settings.caldavNoCalendars"),
      );
    } catch (cause) {
      setCaldavStatus(
        `${t("settings.caldavError")}: ${cause instanceof Error ? cause.message : String(cause)}`,
      );
    } finally {
      setCaldavBusy(false);
    }
  }

  async function runCalDavSync() {
    // An automatic import and a click must never overlap: both would read the
    // same ctag and apply the same plan twice.
    if (caldavBusyRef.current) return;
    if (!isCalDavReady(caldav.config)) {
      setCaldavStatus(
        isCalDavConfigured(caldav.config)
          ? t("settings.caldavNoCalendarSelected")
          : t("settings.caldavNotConfigured"),
      );
      return;
    }
    caldavBusyRef.current = true;
    setCaldavBusy(true);
    setCaldavStatus(t("settings.caldavSyncing"));
    try {
      const result = await syncCalDav(caldav, {
        onProgress: (done, total, calendar) => {
          if (calendar) {
            setCaldavStatus(t("settings.caldavProgress", { done, total, calendar }));
          }
        },
      });
      setCaldav((current) => {
        const next = { ...current, state: result.nextState };
        saveCalDavSettings(next);
        return next;
      });
      setCaldavStatus(
        result.errors.length > 0
          ? `${t("settings.caldavError")}: ${result.errors.slice(0, 3).join("; ")}`
          : t("settings.caldavResult", {
              created: result.created,
              updated: result.updated,
              deleted: result.deleted,
              unchanged: result.unchanged,
            }),
      );
      if (result.created + result.updated + result.deleted > 0) {
        await refresh();
        await touchScanner();
      }
    } catch (cause) {
      setCaldavStatus(
        `${t("settings.caldavError")}: ${cause instanceof Error ? cause.message : String(cause)}`,
      );
    } finally {
      caldavBusyRef.current = false;
      setCaldavBusy(false);
    }
  }

  async function testWebdav() {
    if (!isWebDavConfigured(webdav)) {
      setWebdavStatus(t("settings.webdavNotConfigured"));
      return;
    }
    setWebdavBusy(true);
    setWebdavStatus(t("settings.webdavTesting"));
    try {
      await new WebDavClient(webdav).test();
      setWebdavStatus(t("settings.webdavTestOk"));
    } catch (cause) {
      setWebdavStatus(
        `${t("settings.webdavTestFailed")}: ${cause instanceof Error ? cause.message : String(cause)}`,
      );
    } finally {
      setWebdavBusy(false);
    }
  }

  async function runWebdavSync() {
    if (webdavBusyRef.current) return;
    if (!isWebDavConfigured(webdav)) {
      setWebdavStatus(t("settings.webdavNotConfigured"));
      return;
    }
    webdavBusyRef.current = true;
    setWebdavBusy(true);
    setWebdavConflicts([]);
    setWebdavStatus(t("settings.webdavSyncing"));
    try {
      const result = await syncWebDav(webdav, settings.dataDir, {
        onProgress: (progress) =>
          setWebdavStatus(
            t("settings.webdavProgress", {
              phase: t(`settings.webdavPhase_${progress.phase}`),
              done: progress.done,
              total: progress.total,
            }),
          ),
      });
      setWebdavConflicts(result.conflicts);
      setWebdavStatus(
        result.errors.length > 0
          ? `${t("settings.webdavError")}: ${result.errors.slice(0, 3).join("; ")}`
          : t("settings.webdavResult", {
              uploaded: result.uploaded,
              downloaded: result.downloaded,
              merged: result.merged,
              conflicts: result.conflicts.length,
            }),
      );
      if (result.downloaded > 0 || result.merged > 0) await reloadFromDisk();
      else await touchScanner();
    } catch (cause) {
      setWebdavStatus(
        `${t("settings.webdavError")}: ${cause instanceof Error ? cause.message : String(cause)}`,
      );
    } finally {
      webdavBusyRef.current = false;
      setWebdavBusy(false);
    }
  }

  async function resolveWebdavConflict(conflict: SyncConflict, decisions: MergeDecisions) {
    webdavBusyRef.current = true;
    setWebdavBusy(true);
    try {
      const result = await resolveConflict(webdav, settings.dataDir, conflict, decisions);
      if (result.resolved) {
        setWebdavConflicts((current) => current.filter((item) => item.path !== conflict.path));
        setWebdavStatus(t("settings.webdavResolved", { path: conflict.path }));
      } else {
        // A partial answer leaves the file untouched; keep only what is still open.
        setWebdavConflicts((current) =>
          current.map((item) =>
            item.path === conflict.path ? { ...item, items: result.remaining } : item,
          ),
        );
        setWebdavStatus(
          result.error
            ? `${t("settings.webdavError")}: ${result.error}`
            : t("settings.webdavResolveIncomplete"),
        );
      }
      // The local file changed even when the upload failed, so the in-memory
      // store must not survive to write over the merge.
      if (result.written) await reloadFromDisk();
    } catch (cause) {
      setWebdavStatus(
        `${t("settings.webdavError")}: ${cause instanceof Error ? cause.message : String(cause)}`,
      );
    } finally {
      webdavBusyRef.current = false;
      setWebdavBusy(false);
    }
  }

  if (!settings.dataDir || (!ready && !error)) {
    return (
      <div className="onboarding">
        <div className="onboarding-card">
          <div className="brand-mark" aria-hidden="true">
            <DaymarkMark />
          </div>
          <h1>{t("app.name")}</h1>
          <p className="tagline">{t("app.tagline")}</p>
          <h2>{t("onboarding.title")}</h2>
          <p className="muted">{t("onboarding.body")}</p>
          <button className="primary" onClick={chooseFolder}>
            {t("onboarding.choose")}
          </button>
          <p className="hint">{t("onboarding.hint")}</p>
          {error && <p className="error">{error}</p>}
        </div>
      </div>
    );
  }

  const weekStart = startOfWeek(anchor, { weekStartsOn: settings.weekStartsOn });
  const periodTitle =
    view === "week"
      ? `${format(weekStart, "MMM d", { locale: dateLocale })} – ${format(addDays(weekStart, 6), "MMM d, yyyy", { locale: dateLocale })}`
      : view === "month"
        ? format(anchor, "MMMM yyyy", { locale: dateLocale })
        : format(anchor, "PPPP", { locale: dateLocale });

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <DaymarkMark />
          <div>
            <strong>{t("app.name")}</strong>
            <span>{t("app.tagline")}</span>
          </div>
        </div>
        <nav>
          {(["day", "week", "month", "reports", "settings"] as View[]).map((item) => (
            <button
              key={item}
              className={view === item ? "nav-item active" : "nav-item"}
              onClick={() => setView(item)}
            >
              {t(`nav.${item}`)}
            </button>
          ))}
        </nav>
        <div className="sidebar-footer" title={settings.dataDir}>
          <span>{t("settings.storageFormat")}</span>
          <small>{settings.dataDir.split("/").filter(Boolean).pop()}</small>
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <div className="period-nav">
            <button className="ghost" onClick={() => setAnchor(shiftAnchor(anchor, view, -1))} aria-label={t("actions.prev")}>
              ←
            </button>
            <button className="ghost" onClick={() => setAnchor(new Date())}>
              {t("actions.today")}
            </button>
            <button className="ghost" onClick={() => setAnchor(shiftAnchor(anchor, view, 1))} aria-label={t("actions.next")}>
              →
            </button>
            <span className="period-title">{periodTitle}</span>
          </div>
          {view !== "reports" && view !== "settings" && (
            <button
              className="primary"
              onClick={() => {
                setEditing(null);
                setDraftDate(anchor);
                setEditorOpen(true);
              }}
            >
              + {t("actions.add")}
            </button>
          )}
        </header>

        {conflict && (
          <div className="banner">
            <span>{t("settings.conflict")}</span>
            <button onClick={reloadFromDisk}>{t("actions.reload")}</button>
          </div>
        )}
        {error && <div className="banner error">{error}</div>}

        <section className="content">
          {view === "week" && (
            <WeekView
              anchor={anchor}
              tasks={tasks}
              categories={categories}
              language={language}
              weekStartsOn={settings.weekStartsOn}
              onSelectDay={(day) => {
                setAnchor(day);
                setView("day");
              }}
              onToggle={toggleTask}
              onEdit={(task) => {
                setEditing(task);
                setDraftDate(null);
                setEditorOpen(true);
              }}
              onAddAt={(day) => {
                setEditing(null);
                setDraftDate(day);
                setEditorOpen(true);
              }}
            />
          )}
          {view === "day" && (
            <DayView
              anchor={anchor}
              tasks={tasks}
              categories={categories}
              language={language}
              onToggle={toggleTask}
              onEdit={(task) => {
                setEditing(task);
                setDraftDate(null);
                setEditorOpen(true);
              }}
              onAddAt={(day) => {
                setEditing(null);
                setDraftDate(day);
                setEditorOpen(true);
              }}
            />
          )}
          {view === "month" && (
            <MonthView
              anchor={anchor}
              tasks={tasks}
              language={language}
              weekStartsOn={settings.weekStartsOn}
              onSelectDay={(day) => {
                setAnchor(day);
                setView("day");
              }}
            />
          )}
          {view === "reports" && (
            <ReportsView
              anchor={anchor}
              tasks={tasks}
              categories={categories}
              language={language}
              numbering={settings.numbering}
              weekStartsOn={settings.weekStartsOn}
              assessmentMonthStartDay={settings.assessmentMonthStartDay}
              assessmentYearStartMonth={settings.assessmentYearStartMonth}
              userName={settings.userName}
              dataDir={settings.dataDir}
              ai={ai}
              onNumberingChange={(numbering: NumberingStyle) => patchSettings({ numbering })}
            />
          )}
          {view === "settings" && (
            <SettingsView
              settings={settings}
              categories={categories}
              deviceId={readDeviceId()}
              webdav={webdav}
              webdavBusy={webdavBusy}
              webdavStatus={webdavStatus}
              webdavConflicts={webdavConflicts}
              webdavAutoSyncMinutes={webdav.autoSyncMinutes}
              ai={ai}
              caldav={caldav.config}
              caldavState={caldav.state}
              caldavFound={caldavFound}
              caldavBusy={caldavBusy}
              caldavStatus={caldavStatus}
              caldavRefreshMinutes={caldav.refreshMinutes}
              caldavImportOnLaunch={caldav.importOnLaunch}
              onWebdavPatch={patchWebdav}
              onWebdavTest={testWebdav}
              onWebdavSync={runWebdavSync}
              onWebdavAutoSync={setWebdavAutoSync}
              onWebdavSyncOnLaunch={setWebdavSyncOnLaunch}
              onWebdavResolve={resolveWebdavConflict}
              onCalDavPatch={patchCalDav}
              onCalDavDiscover={discoverCalDavCalendars}
              onCalDavToggle={toggleCalDavCalendar}
              onCalDavSync={runCalDavSync}
              onCalDavRefresh={setCalDavRefresh}
              onCalDavImportOnLaunch={setCalDavImportOnLaunch}
              onAiPatch={patchAi}
              onLanguage={changeLanguage}
              onChangeFolder={chooseFolder}
              onPatch={patchSettings}
              onAddCategory={async (en, zh, color) => {
                await createCategory(en, zh, color);
                await refresh();
                await touchScanner();
              }}
              onArchiveCategory={async (id) => {
                await archiveCategory(id);
                await refresh();
                await touchScanner();
              }}
            />
          )}
        </section>
      </main>

      {editorOpen && (
        <TaskEditor
          task={editing}
          defaultDate={draftDate}
          categories={categories}
          language={language}
          ai={ai}
          readOnly={editing?.source === "caldav"}
          onSave={saveDraft}
          onCreateMany={createDrafts}
          onDelete={editing && editing.source !== "caldav" ? () => deleteTask(editing) : undefined}
          onDetach={editing?.source === "caldav" ? () => detachTask(editing) : undefined}
          onClose={() => {
            setEditorOpen(false);
            setEditing(null);
            setDraftDate(null);
          }}
        />
      )}
    </div>
  );
}

function shiftAnchor(anchor: Date, view: View, direction: number): Date {
  if (view === "month") return new Date(anchor.getFullYear(), anchor.getMonth() + direction, 1);
  if (view === "week") return addDays(anchor, direction * 7);
  if (view === "day") return addDays(anchor, direction);
  return anchor;
}

function DaymarkMark() {
  return (
    <svg viewBox="0 0 32 32" width="28" height="28" aria-hidden="true">
      <rect x="3" y="3" width="26" height="26" rx="7" fill="currentColor" opacity="0.14" />
      <path d="M9 10h8a6 6 0 0 1 0 12H9z" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinejoin="round" />
      <circle cx="23" cy="9" r="2.2" fill="currentColor" />
    </svg>
  );
}
