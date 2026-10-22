import { addDays, format, startOfWeek } from "date-fns";
import { enUS } from "date-fns/locale/en-US";
import { zhCN } from "date-fns/locale/zh-CN";
import { useTranslation } from "react-i18next";
import type { AppLanguage, Category, Task } from "../../domain/types";

interface WeekViewProps {
  anchor: Date;
  tasks: Task[];
  categories: Category[];
  language: AppLanguage;
  /** 0 = Sunday, 1 = Monday. Comes from the synced settings file. */
  weekStartsOn: 0 | 1;
  onSelectDay: (day: Date) => void;
  onToggle: (task: Task) => void;
  onEdit: (task: Task) => void;
  onAddAt: (day: Date) => void;
}

export function taskDateKey(task: Task): string | null {
  const value = task.startAt ?? task.dueAt;
  return value ? value.slice(0, 10) : null;
}

export function tasksForDay(tasks: Task[], day: Date): Task[] {
  const key = format(day, "yyyy-MM-dd");
  return tasks.filter((task) => taskDateKey(task) === key);
}

export default function WeekView({
  anchor,
  tasks,
  categories,
  language,
  weekStartsOn,
  onSelectDay,
  onToggle,
  onEdit,
  onAddAt,
}: WeekViewProps) {
  const { t } = useTranslation();
  const locale = language === "zh-CN" ? zhCN : enUS;
  const start = startOfWeek(anchor, { weekStartsOn });
  const days = Array.from({ length: 7 }, (_, index) => addDays(start, index));
  const categoryById = new Map(categories.map((category) => [category.id, category]));
  const todayKey = format(new Date(), "yyyy-MM-dd");

  return (
    <div className="week-grid">
      {days.map((day) => {
        const dayTasks = tasksForDay(tasks, day);
        const key = format(day, "yyyy-MM-dd");
        return (
          <div key={key} className={key === todayKey ? "week-column today" : "week-column"}>
            <button className="day-header" onClick={() => onSelectDay(day)}>
              <span>{format(day, "EEE", { locale })}</span>
              <strong>{format(day, "d")}</strong>
            </button>
            <div className="day-tasks">
              {dayTasks.map((task) => {
                const category = task.categoryId ? categoryById.get(task.categoryId) : undefined;
                return (
                  <div key={task.id} className={task.status === "done" ? "task-chip done" : "task-chip"}>
                    <button
                      className="check"
                      onClick={() => onToggle(task)}
                      aria-label={task.status === "done" ? t("actions.reopen") : t("actions.complete")}
                    >
                      {task.status === "done" ? "✓" : ""}
                    </button>
                    <button className="task-title" onClick={() => onEdit(task)} title={task.title}>
                      {task.title}
                    </button>
                    {category && <span className="dot" style={{ background: category.color }} title={language === "zh-CN" ? category.nameZh : category.nameEn} />}
                  </div>
                );
              })}
              <button className="add-inline" onClick={() => onAddAt(day)}>
                +
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
