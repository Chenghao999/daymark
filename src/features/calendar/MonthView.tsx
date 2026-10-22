import { addDays, endOfMonth, format, isSameMonth, startOfMonth, startOfWeek } from "date-fns";
import { enUS } from "date-fns/locale/en-US";
import { zhCN } from "date-fns/locale/zh-CN";
import { useTranslation } from "react-i18next";
import type { AppLanguage, Task } from "../../domain/types";
import { tasksForDay } from "./WeekView";

interface MonthViewProps {
  anchor: Date;
  tasks: Task[];
  language: AppLanguage;
  /** 0 = Sunday, 1 = Monday. Comes from the synced settings file. */
  weekStartsOn: 0 | 1;
  onSelectDay: (day: Date) => void;
}

export default function MonthView({ anchor, tasks, language, weekStartsOn, onSelectDay }: MonthViewProps) {
  const { t } = useTranslation();
  const locale = language === "zh-CN" ? zhCN : enUS;
  const monthStart = startOfMonth(anchor);
  const gridStart = startOfWeek(monthStart, { weekStartsOn });
  const monthEnd = endOfMonth(anchor);
  const cells = Array.from({ length: 42 }, (_, index) => addDays(gridStart, index));
  const weekdayLabels = Array.from({ length: 7 }, (_, index) =>
    format(addDays(gridStart, index), "EEE", { locale }),
  );
  const todayKey = format(new Date(), "yyyy-MM-dd");

  return (
    <div className="month-view">
      <div className="month-weekdays">
        {weekdayLabels.map((label) => (
          <span key={label}>{label}</span>
        ))}
      </div>
      <div className="month-grid">
        {cells.map((day) => {
          const key = format(day, "yyyy-MM-dd");
          const dayTasks = tasksForDay(tasks, day);
          const visible = dayTasks.slice(0, 3);
          return (
            <button
              key={key}
              className={[
                "month-cell",
                isSameMonth(day, anchor) ? "" : "outside",
                key === todayKey ? "today" : "",
              ].join(" ")}
              onClick={() => onSelectDay(day)}
            >
              <span className="date-number">{format(day, "d")}</span>
              {visible.map((task) => (
                <span key={task.id} className={task.status === "done" ? "mini-task done" : "mini-task"}>
                  {task.title}
                </span>
              ))}
              {dayTasks.length > visible.length && (
                <span className="more">{t("common.more", { count: dayTasks.length - visible.length })}</span>
              )}
            </button>
          );
        })}
      </div>
      <p className="muted month-range">
        {format(monthStart, "MMMM yyyy", { locale })} · {format(monthEnd, "d")}
      </p>
    </div>
  );
}
