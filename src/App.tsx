import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { addDays, format, startOfWeek } from "date-fns";
import { enUS } from "date-fns/locale/en-US";
import { zhCN } from "date-fns/locale/zh-CN";
import type { AppLanguage, Category, NumberingStyle, Task } from "./domain/types";
import { closeDatabase, deviceId as readDeviceId, openDatabase } from "./db/client";
import {
  archiveCategory,
  completeTask,
  createCategory,
  createTask,
  listCategories,
  listTasks,
  reopenTask,
  softDeleteTask,
  updateTask,
} from "./db/repository";
import { databasePath, loadSettings, saveSettings, type AppSettings } from "./settings/store";
import { startFileScanner, type FileScanner } from "./sync/scanner";
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
  const bootedRef = useRef(false);
  const scannerRef = useRef<FileScanner | null>(null);

  const language = settings.language;
  const dateLocale = language === "zh-CN" ? zhCN : enUS;

  const refresh = useCallback(async () => {
    const [nextTasks, nextCategories] = await Promise.all([listTasks(), listCategories()]);
    setTasks(nextTasks);
    setCategories(nextCategories);
  }, []);

  const activateFolder = useCallback(
    async (dir: string) => {
      const next = { ...settings, dataDir: dir };
      saveSettings(next);
      setSettings(next);
      try {
        await openDatabase(databasePath(next));
        await refresh();
        setReady(true);
        setError(null);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : String(cause));
      }
    },
    [refresh, settings],
  );

  useEffect(() => {
    if (bootedRef.current) return;
    bootedRef.current = true;
    if (!settings.dataDir) return;
    void (async () => {
      try {
        await openDatabase(databasePath(settings));
        await refresh();
        setReady(true);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : String(cause));
      }
    })();
  }, [refresh, settings]);

  useEffect(() => {
    if (!ready) return;
    scannerRef.current?.stop();
    const scanner = startFileScanner({
      filePath: databasePath(settings),
      intervalMs: Math.max(10, settings.scanIntervalSec) * 1000,
      onExternalChange: () => setConflict(true),
    });
    scannerRef.current = scanner;
    return () => {
      scanner.stop();
      scannerRef.current = null;
    };
  }, [ready, settings]);

  async function chooseFolder() {
    const picked = await openDialog({ directory: true, multiple: false, title: t("onboarding.choose") });
    if (typeof picked === "string") await activateFolder(picked);
  }

  async function reloadFromDisk() {
    try {
      await closeDatabase();
      await openDatabase(databasePath(settings));
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

  async function toggleTask(task: Task) {
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

  const weekStart = startOfWeek(anchor, { weekStartsOn: 1 });
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
          <span>{settings.dbFileName}</span>
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
              onNumberingChange={(numbering: NumberingStyle) => patchSettings({ numbering })}
            />
          )}
          {view === "settings" && (
            <SettingsView
              settings={settings}
              categories={categories}
              deviceId={readDeviceId()}
              onLanguage={changeLanguage}
              onChangeFolder={chooseFolder}
              onPatch={patchSettings}
              onAddCategory={async (en, zh, color) => {
                await createCategory(en, zh, color);
                await refresh();
              }}
              onArchiveCategory={async (id) => {
                await archiveCategory(id);
                await refresh();
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
          onSave={saveDraft}
          onDelete={editing ? () => deleteTask(editing) : undefined}
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
