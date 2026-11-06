import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { AiConfig, AiFeature, AiUsage } from "../../ai/types";
import {
  aiContextSummary,
  buildPrompt,
  costOf,
  createAiProvider,
  estimatePrompt,
  formatCost,
  formatMoney,
  saveAiOutput,
} from "../../ai";
import type { AppLanguage, ReportDocument } from "../../domain/types";
import { useOnline } from "../../hooks/useOnline";

interface AiPanelProps {
  report: ReportDocument;
  language: AppLanguage;
  userName: string;
  ai: AiConfig;
  dataDir: string;
  onUseResult: (text: string) => void;
  onClose: () => void;
}

export default function AiPanel({ report, language, userName, ai, dataDir, onUseResult, onClose }: AiPanelProps) {
  const { t } = useTranslation();
  const online = useOnline();
  const [feature, setFeature] = useState<AiFeature>("polish");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [savedPath, setSavedPath] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [usage, setUsage] = useState<AiUsage | null>(null);
  const [retrying, setRetrying] = useState<{ attempt: number; total: number; seconds: string } | null>(
    null,
  );

  const prompt = useMemo(
    () => buildPrompt({ feature, language, report, userName }),
    [feature, language, report, userName],
  );
  const summary = useMemo(() => aiContextSummary(report), [report]);
  const estimate = useMemo(() => estimatePrompt(prompt), [prompt]);
  const inputCost = useMemo(
    () => costOf({ inputTokens: estimate.inputTokens, outputTokens: 0 }, ai.pricing),
    [estimate.inputTokens, ai.pricing],
  );
  const cost = costOf(usage, ai.pricing);

  function choose(next: AiFeature) {
    setFeature(next);
    setResult(null);
    setSavedPath(null);
    setCopied(false);
    setError(null);
    setUsage(null);
    setRetrying(null);
  }

  async function generate() {
    setBusy(true);
    setError(null);
    setSavedPath(null);
    setRetrying(null);
    try {
      const answer = await createAiProvider(ai, {
        onRetry: ({ attempt, totalAttempts, delayMs }) =>
          setRetrying({
            attempt,
            total: totalAttempts,
            seconds: delayMs % 1000 === 0 ? String(delayMs / 1000) : (delayMs / 1000).toFixed(1),
          }),
      }).complete(prompt);
      setResult(answer.text);
      setUsage(answer.usage ?? null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setRetrying(null);
      setBusy(false);
    }
  }

  async function copy() {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result);
      setCopied(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }

  async function save() {
    if (!result?.trim()) return;
    setBusy(true);
    setError(null);
    try {
      setSavedPath(await saveAiOutput(dataDir, report.kind, result));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  }

  function useInExport() {
    if (!result?.trim()) return;
    onUseResult(result);
    onClose();
  }

  return (
    <div className="modal-backdrop">
      <div className="modal ai-modal" role="dialog" aria-modal="true" aria-labelledby="ai-panel-title">
        <header>
          <h2 id="ai-panel-title">{t("ai.title")}</h2>
          <button className="ghost" onClick={onClose} disabled={busy} aria-label={t("actions.close")}>
            ×
          </button>
        </header>

        <div className="segmented">
          <button className={feature === "polish" ? "active" : ""} onClick={() => choose("polish")} disabled={busy}>
            {t("ai.featurePolish")}
          </button>
          <button className={feature === "review" ? "active" : ""} onClick={() => choose("review")} disabled={busy}>
            {t("ai.featureReview")}
          </button>
        </div>

        <p className="muted small">
          {t("ai.context", {
            sections: summary.sectionCount,
            items: summary.itemCount,
            chars: summary.characters,
          })}
        </p>
        <p className="muted small">
          {t("ai.estimate", { chars: estimate.characters, tokens: estimate.inputTokens })}
        </p>
        {result === null && inputCost && (
          <p className="muted small">
            {t("ai.estimatedInputCost", { cost: formatCost(inputCost) })}
          </p>
        )}

        <details className="ai-preview">
          <summary>{t("ai.preview")}</summary>
          <pre>{prompt.user}</pre>
        </details>

        {retrying && (
          <p className="muted small">
            {t("ai.retrying", {
              seconds: retrying.seconds,
              attempt: retrying.attempt,
              total: retrying.total,
            })}
          </p>
        )}

        {result === null ? (
          <div className="button-row">
            <button
              className="primary"
              onClick={() => void generate()}
              disabled={busy || !online}
            >
              {busy ? t("ai.generating") : error ? t("ai.retry") : t("ai.generate")}
            </button>
            <button className="ghost" onClick={onClose} disabled={busy}>
              {t("actions.cancel")}
            </button>
          </div>
        ) : (
          <>
            <label className="field">
              <span>{t("ai.result")}</span>
              <textarea
                className="ai-output"
                value={result}
                rows={14}
                onChange={(event) => setResult(event.currentTarget.value)}
              />
            </label>
            <div className="button-row">
              <button className="primary" onClick={() => void save()} disabled={busy || !result.trim()}>
                {t("ai.save")}
              </button>
              <button className="ghost" onClick={() => void copy()}>
                {copied ? t("ai.copied") : t("ai.copy")}
              </button>
              <button className="ghost" onClick={useInExport} disabled={!result.trim()}>
                {t("ai.useInExport")}
              </button>
              <button className="ghost" onClick={onClose} disabled={busy}>
                {t("actions.close")}
              </button>
            </div>
            {savedPath && <p className="muted small">{t("ai.saved", { path: savedPath })}</p>}
            {usage && (
              <p className="muted small">
                {t("ai.usage", { input: usage.inputTokens, output: usage.outputTokens })}
              </p>
            )}
            {cost && (
              <p className="muted small">
                {t("ai.cost", {
                  total: formatCost(cost),
                  input: formatMoney(cost.input, cost.currency),
                  output: formatMoney(cost.output, cost.currency),
                })}
              </p>
            )}
          </>
        )}

        {!online && <p className="muted small">{t("ai.offline")}</p>}
        {error && <p className="error">{t("ai.error", { message: error })}</p>}
      </div>
    </div>
  );
}
