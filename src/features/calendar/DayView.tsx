import { format } from "date-fns";
import { enUS } from "date-fns/locale/en-US";
import { zhCN } from "date-fns/locale/zh-CN";
import { useTranslation } from "react-i18next";
import type { AppLanguage, Category, Task } from "../../domain/types";
import { taskDateKey, tasksForDay } from "./WeekView";

interface DayViewProps {
  anchor: Date;
  tasks: Task[];
  categories: Category[];
  language: AppLanguage;
  onToggle: (task: Task) => void;
  onEdit: (task: Task) => void;
  onAddAt: (day: Date) => void;
}

export default function DayView({ anchor, tasks, categories, language, onToggle, onEdit, onAddAt }: DayViewProps) {
  const { t } = useTranslation();
  const locale = language === "zh-CN" ? zhCN : enUS;
  const categoryById = new Map(categories.map((category) => [category.id, category]));
  const scheduled = tasksForDay(tasks, anchor);
  const backlog = tasks.filter((task) => task.status !== "done" && !taskDateKey(task));

  return (
    <div className="day-view">
      <div className="day-view-header">
        <h2>{format(anchor, "PPPP", { locale })}</h2>
        <button className="primary" onClick={() => onAddAt(anchor)}>
          + {t("actions.add")}
        </button>
      </div>

      <section>
        <h3>{t("task.scheduled")}</h3>
        {scheduled.length === 0 && <p className="muted">{t("task.noTasks")}</p>}
        <ul className="task-list">
          {scheduled.map((task) => {
            const category = task.categoryId ? categoryById.get(task.categoryId) : undefined;
            return (
              <li key={task.id} className={task.status === "done" ? "done" : ""}>
                <button
                  className="check"
                  onClick={() => onToggle(task)}
                  aria-label={task.status === "done" ? t("actions.reopen") : t("actions.complete")}
                >
                  {task.status === "done" ? "✓" : ""}
                </button>
                <button className="task-title" onClick={() => onEdit(task)}>
                  {task.title}
                </button>
                {task.startAt && task.startAt.length > 10 && (
                  <span className="time">{task.startAt.slice(11, 16)}</span>
                )}
                {category && <span className="pill" style={{ borderColor: category.color }}>{language === "zh-CN" ? category.nameZh : category.nameEn}</span>}
              </li>
            );
          })}
        </ul>
      </section>

      <section>
        <h3>{t("task.backlog")}</h3>
        {backlog.length === 0 && <p className="muted">{t("task.noTasks")}</p>}
        <ul className="task-list">
          {backlog.map((task) => (
            <li key={task.id}>
              <button className="check" onClick={() => onToggle(task)} aria-label={t("actions.complete")} />
              <button className="task-title" onClick={() => onEdit(task)}>
                {task.title}
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
