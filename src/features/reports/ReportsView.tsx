import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { useTranslation } from "react-i18next";
import type { AppLanguage, Category, Completion, NumberingStyle, ReportKind, Task } from "../../domain/types";
import { generateReport, reportPeriod } from "../../domain/reports";
import { listCompletions } from "../../db/repository";
import { exportReportDocx } from "./exportDocx";

interface ReportsViewProps {
  anchor: Date;
  tasks: Task[];
  categories: Category[];
  language: AppLanguage;
  numbering: NumberingStyle;
  onNumberingChange: (style: NumberingStyle) => void;
}

export default function ReportsView({
  anchor,
  tasks,
  categories,
  language,
  numbering,
  onNumberingChange,
}: ReportsViewProps) {
  const { t } = useTranslation();
  const [kind, setKind] = useState<ReportKind>("weekly");
  const [completions, setCompletions] = useState<Completion[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  const period = useMemo(() => {
    const { start, end } = reportPeriod(kind, anchor);
    if (kind === "daily") {
      return { start, end, label: format(start, "yyyy-MM-dd") };
    }
    if (kind === "weekly") {
      return { start, end, label: `${format(start, "yyyy-MM-dd")} ~ ${format(end, "yyyy-MM-dd")}` };
    }
    return { start, end, label: format(start, "yyyy-MM") };
  }, [anchor, kind]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const rows = await listCompletions(period.start.toISOString(), period.end.toISOString());
        if (!cancelled) setCompletions(rows);
      } catch {
        if (!cancelled) setCompletions([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [period]);

  const report = useMemo(
    () =>
      generateReport({
        kind,
        language,
        periodLabel: period.label,
        periodStart: period.start,
        periodEnd: period.end,
        numbering,
        categories,
        tasks,
        completions,
      }),
    [kind, language, period, numbering, categories, tasks, completions],
  );

  async function exportDocx() {
    setExporting(true);
    setStatus(null);
    try {
      const path = await exportReportDocx(report, language);
      setStatus(path ? t("reports.exported", { path }) : null);
    } catch (cause) {
      setStatus(t("reports.exportFailed", { message: cause instanceof Error ? cause.message : String(cause) }));
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="reports-view">
      <div className="reports-toolbar">
        <div className="segmented">
          {(["daily", "weekly", "monthly"] as ReportKind[]).map((item) => (
            <button key={item} className={kind === item ? "active" : ""} onClick={() => setKind(item)}>
              {t(`reports.${item}`)}
            </button>
          ))}
        </div>
        <label className="inline-field">
          <span>{t("settings.numbering")}</span>
          <select value={numbering} onChange={(event) => onNumberingChange(event.currentTarget.value as NumberingStyle)}>
            <option value="chinese">{t("settings.numberingChinese")}</option>
            <option value="arabic">{t("settings.numberingArabic")}</option>
            <option value="alpha">{t("settings.numberingAlpha")}</option>
          </select>
        </label>
        <div className="spacer" />
        <button className="primary" onClick={() => void exportDocx()} disabled={exporting || report.sections.length === 0}>
          {t("actions.export")}
        </button>
      </div>

      <article className="report-paper">
        <header>
          <h1>{report.title}</h1>
          <p className="muted">{report.periodLabel}</p>
          <p className="report-meta">
            {t("reports.completed", { count: report.completedCount })} · {t("reports.planned", { count: report.scheduledCount })}
          </p>
        </header>

        {report.sections.length === 0 && <p className="muted">{t("reports.empty")}</p>}

        {report.sections.map((section) => (
          <section key={section.categoryId ?? "uncategorized"} className="report-section">
            <h2>
              {section.heading}
              {section.categoryName}
            </h2>
            <ul>
              {section.items.map((item, index) => (
                <li key={`${section.categoryId}-${index}`} className={item.completed ? "done" : ""}>
                  <span>{item.text}</span>
                  {item.date && <time>{item.date}</time>}
                </li>
              ))}
            </ul>
          </section>
        ))}

        <footer className="report-footer">
          {t("reports.generatedAt", { date: format(new Date(report.generatedAt), "yyyy-MM-dd HH:mm") })}
        </footer>
      </article>

      {status && <p className="status">{status}</p>}
    </div>
  );
}
