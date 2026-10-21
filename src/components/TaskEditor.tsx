import { useState } from "react";
import { useTranslation } from "react-i18next";
import { format } from "date-fns";
import type { Category, Task } from "../domain/types";

export interface TaskDraft {
  title: string;
  notes: string;
  categoryId: string | null;
  startAt: string | null;
  endAt: string | null;
  dueAt: string | null;
  priority: number;
  allDay: boolean;
}

interface TaskEditorProps {
  task: Task | null;
  defaultDate: Date | null;
  categories: Category[];
  language: "en" | "zh-CN";
  onSave: (draft: TaskDraft) => Promise<void>;
  onDelete?: () => Promise<void>;
  onClose: () => void;
}

function toLocalInput(value: string | null): string {
  if (!value) return "";
  return value.slice(0, 16);
}

export default function TaskEditor({
  task,
  defaultDate,
  categories,
  language,
  onSave,
  onDelete,
  onClose,
}: TaskEditorProps) {
  const { t } = useTranslation();
  const [title, setTitle] = useState(task?.title ?? "");
  const [notes, setNotes] = useState(task?.notes ?? "");
  const [categoryId, setCategoryId] = useState<string>(task?.categoryId ?? categories[0]?.id ?? "");
  const [startAt, setStartAt] = useState(
    toLocalInput(task?.startAt ?? (defaultDate ? `${format(defaultDate, "yyyy-MM-dd")}T09:00` : null)),
  );
  const [endAt, setEndAt] = useState(toLocalInput(task?.endAt ?? null));
  const [dueAt, setDueAt] = useState(toLocalInput(task?.dueAt ?? null));
  const [priority, setPriority] = useState(task?.priority ?? 0);
  const [allDay, setAllDay] = useState(task?.allDay ?? false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!title.trim()) {
      setError(t("task.validationTitle"));
      return;
    }
    setBusy(true);
    try {
      await onSave({
        title: title.trim(),
        notes,
        categoryId: categoryId || null,
        startAt: allDay ? (startAt ? startAt.slice(0, 10) : null) : startAt || null,
        endAt: allDay ? null : endAt || null,
        dueAt: dueAt || null,
        priority,
        allDay,
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <form className="modal" onSubmit={submit}>
        <header>
          <h2>{task ? t("task.edit") : t("task.new")}</h2>
          <button type="button" className="ghost" onClick={onClose} aria-label={t("actions.close")}>
            ×
          </button>
        </header>

        <label className="field">
          <span>{t("task.title")}</span>
          <input
            autoFocus
            value={title}
            onChange={(event) => setTitle(event.currentTarget.value)}
            placeholder={t("task.titlePlaceholder")}
          />
        </label>

        <div className="field-row">
          <label className="field">
            <span>{t("task.category")}</span>
            <select value={categoryId} onChange={(event) => setCategoryId(event.currentTarget.value)}>
              <option value="">{t("task.uncategorized")}</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {language === "zh-CN" ? category.nameZh : category.nameEn}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>{t("task.priority")}</span>
            <select value={priority} onChange={(event) => setPriority(Number(event.currentTarget.value))}>
              <option value={0}>{t("task.priority0")}</option>
              <option value={1}>{t("task.priority1")}</option>
              <option value={2}>{t("task.priority2")}</option>
              <option value={3}>{t("task.priority3")}</option>
            </select>
          </label>
        </div>

        <label className="checkbox">
          <input type="checkbox" checked={allDay} onChange={(event) => setAllDay(event.currentTarget.checked)} />
          <span>{t("task.allDay")}</span>
        </label>

        <div className="field-row">
          <label className="field">
            <span>{t("task.start")}</span>
            <input
              type={allDay ? "date" : "datetime-local"}
              value={allDay ? startAt.slice(0, 10) : startAt}
              onChange={(event) => setStartAt(event.currentTarget.value)}
            />
          </label>
          <label className="field">
            <span>{t("task.due")}</span>
            <input type="date" value={dueAt.slice(0, 10)} onChange={(event) => setDueAt(event.currentTarget.value)} />
          </label>
        </div>

        {!allDay && (
          <label className="field">
            <span>{t("task.end")}</span>
            <input type="datetime-local" value={endAt} onChange={(event) => setEndAt(event.currentTarget.value)} />
          </label>
        )}

        <label className="field">
          <span>{t("task.notes")}</span>
          <textarea rows={4} value={notes} onChange={(event) => setNotes(event.currentTarget.value)} />
        </label>

        {error && <p className="error">{error}</p>}

        <footer>
          {onDelete && (
            <button type="button" className="danger" onClick={() => void onDelete()} disabled={busy}>
              {t("actions.delete")}
            </button>
          )}
          <div className="spacer" />
          <button type="button" className="ghost" onClick={onClose} disabled={busy}>
            {t("actions.cancel")}
          </button>
          <button type="submit" className="primary" disabled={busy}>
            {t("actions.save")}
          </button>
        </footer>
      </form>
    </div>
  );
}
