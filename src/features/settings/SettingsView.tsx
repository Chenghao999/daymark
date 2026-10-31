import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { AppLanguage, Category, NumberingStyle } from "../../domain/types";
import type { AppSettings } from "../../settings/store";
import type { SyncConflict, WebDavConfig } from "../../sync/webdav/types";
import type { MergeDecision, MergeDecisions } from "../../sync/merge";
import type { AiConfig } from "../../ai/types";

interface SettingsViewProps {
  settings: AppSettings;
  categories: Category[];
  deviceId: string;
  webdav: WebDavConfig;
  webdavBusy: boolean;
  webdavStatus: string | null;
  webdavConflicts: SyncConflict[];
  ai: AiConfig;
  onLanguage: (language: AppLanguage) => Promise<void>;
  onChangeFolder: () => Promise<void>;
  onPatch: (patch: Partial<AppSettings>) => void;
  onAddCategory: (nameEn: string, nameZh: string, color: string) => Promise<void>;
  onArchiveCategory: (id: string) => Promise<void>;
  onWebdavPatch: (patch: Partial<WebDavConfig>) => void;
  onWebdavTest: () => Promise<void>;
  onWebdavSync: () => Promise<void>;
  onWebdavResolve: (conflict: SyncConflict, decisions: MergeDecisions) => Promise<void>;
  onAiPatch: (patch: Partial<AiConfig>) => void;
}

const COLORS = ["#5b8def", "#e0a03a", "#7f8c9a", "#4bb37a", "#c96b9b", "#8a6bd1", "#4aa3a3", "#c0574f"];

export default function SettingsView({
  settings,
  categories,
  deviceId,
  webdav,
  webdavBusy,
  webdavStatus,
  webdavConflicts,
  ai,
  onLanguage,
  onChangeFolder,
  onPatch,
  onAddCategory,
  onArchiveCategory,
  onWebdavPatch,
  onWebdavTest,
  onWebdavSync,
  onWebdavResolve,
  onAiPatch,
}: SettingsViewProps) {
  const { t } = useTranslation();
  const [nameEn, setNameEn] = useState("");
  const [nameZh, setNameZh] = useState("");
  const [color, setColor] = useState(COLORS[0]);
  // Per conflict path, the answer chosen for each item. A new sync starts blank.
  const [decisions, setDecisions] = useState<Record<string, MergeDecisions>>({});

  // A sync clears the list before filling it, which is the cue to forget the
  // answers from the previous run.
  useEffect(() => {
    if (webdavConflicts.length === 0) setDecisions({});
  }, [webdavConflicts]);

  function choose(path: string, itemId: string, decision: MergeDecision) {
    setDecisions((current) => ({
      ...current,
      [path]: { ...current[path], [itemId]: decision },
    }));
  }

  async function addCategory(event: React.FormEvent) {
    event.preventDefault();
    if (!nameEn.trim() || !nameZh.trim()) return;
    await onAddCategory(nameEn.trim(), nameZh.trim(), color);
    setNameEn("");
    setNameZh("");
  }

  return (
    <div className="settings-view">
      <section className="settings-card">
        <h2>{t("settings.title")}</h2>

        <label className="field">
          <span>{t("settings.language")}</span>
          <select value={settings.language} onChange={(event) => void onLanguage(event.currentTarget.value as AppLanguage)}>
            <option value="zh-CN">简体中文</option>
            <option value="en">English</option>
          </select>
        </label>

        <label className="field">
          <span>{t("settings.appearance")}</span>
          <select
            value={settings.theme}
            onChange={(event) => onPatch({ theme: event.currentTarget.value as AppSettings["theme"] })}
          >
            <option value="system">{t("settings.themeSystem")}</option>
            <option value="light">{t("settings.themeLight")}</option>
            <option value="dark">{t("settings.themeDark")}</option>
          </select>
        </label>

        <label className="field">
          <span>{t("settings.weekStart")}</span>
          <select
            value={settings.weekStartsOn}
            onChange={(event) =>
              onPatch({ weekStartsOn: Number(event.currentTarget.value) === 0 ? 0 : 1 })
            }
          >
            <option value={1}>{t("settings.weekStartMonday")}</option>
            <option value={0}>{t("settings.weekStartSunday")}</option>
          </select>
        </label>

        <label className="field">
          <span>{t("settings.numbering")}</span>
          <select
            value={settings.numbering}
            onChange={(event) => onPatch({ numbering: event.currentTarget.value as NumberingStyle })}
          >
            <option value="chinese">{t("settings.numberingChinese")}</option>
            <option value="arabic">{t("settings.numberingArabic")}</option>
            <option value="alpha">{t("settings.numberingAlpha")}</option>
          </select>
        </label>

        <label className="field">
          <span>{t("settings.assessmentMonth")}</span>
          <select
            value={settings.assessmentMonthStartDay}
            onChange={(event) => onPatch({ assessmentMonthStartDay: Number(event.currentTarget.value) })}
          >
            {Array.from({ length: 28 }, (_, index) => index + 1).map((day) => (
              <option key={day} value={day}>
                {t("settings.monthStartDay", { day })}
              </option>
            ))}
          </select>
        </label>
        <p className="muted small">{t("settings.assessmentMonthHint")}</p>

        <label className="field">
          <span>{t("settings.assessmentYear")}</span>
          <select
            value={settings.assessmentYearStartMonth}
            onChange={(event) => onPatch({ assessmentYearStartMonth: Number(event.currentTarget.value) })}
          >
            {Array.from({ length: 12 }, (_, index) => index + 1).map((month) => (
              <option key={month} value={month}>
                {t("settings.yearStartMonth", { month })}
              </option>
            ))}
          </select>
        </label>
        <p className="muted small">
          {t("settings.assessmentYearHint", { day: settings.assessmentMonthStartDay })}
        </p>

        <label className="field">
          <span>{t("settings.userName")}</span>
          <input
            value={settings.userName}
            onChange={(event) => onPatch({ userName: event.currentTarget.value })}
            placeholder={t("settings.userNamePlaceholder")}
          />
        </label>

        <label className="field">
          <span>{t("settings.scanInterval")}</span>
          <select
            value={settings.scanIntervalSec}
            onChange={(event) => onPatch({ scanIntervalSec: Number(event.currentTarget.value) })}
          >
            <option value={30}>{t("settings.scanIntervalValue", { seconds: 30 })}</option>
            <option value={60}>{t("settings.scanIntervalValue", { seconds: 60 })}</option>
            <option value={300}>{t("settings.scanIntervalValue", { seconds: 300 })}</option>
          </select>
        </label>
      </section>

      <section className="settings-card">
        <h2>{t("settings.dataLocation")}</h2>
        <code className="path">{settings.dataDir}</code>
        <p className="muted">{t("settings.dataPathHint")}</p>
        <p className="muted small">{t("settings.storageHint")}</p>
        <button onClick={() => void onChangeFolder()}>{t("settings.changeFolder")}</button>
        <p className="muted small">
          {t("settings.deviceId")}: <code>{deviceId}</code>
        </p>
      </section>

      <section className="settings-card">
        <h2>{t("settings.webdav")}</h2>
        <p className="muted small">{t("settings.webdavHint")}</p>

        <label className="field">
          <span>{t("settings.webdavUrl")}</span>
          <input
            value={webdav.url}
            onChange={(event) => onWebdavPatch({ url: event.currentTarget.value })}
            placeholder={t("settings.webdavUrlPlaceholder")}
            autoComplete="off"
            spellCheck={false}
          />
        </label>

        <label className="field">
          <span>{t("settings.webdavRemotePath")}</span>
          <input
            value={webdav.remotePath}
            onChange={(event) => onWebdavPatch({ remotePath: event.currentTarget.value })}
            placeholder="/daymark/"
            autoComplete="off"
            spellCheck={false}
          />
        </label>
        <p className="muted small">{t("settings.webdavRemotePathHint")}</p>

        <div className="field-row">
          <label className="field">
            <span>{t("settings.webdavUsername")}</span>
            <input
              value={webdav.username}
              onChange={(event) => onWebdavPatch({ username: event.currentTarget.value })}
              autoComplete="username"
              spellCheck={false}
            />
          </label>
          <label className="field">
            <span>{t("settings.webdavPassword")}</span>
            <input
              type="password"
              value={webdav.password}
              onChange={(event) => onWebdavPatch({ password: event.currentTarget.value })}
              autoComplete="current-password"
            />
          </label>
        </div>
        <p className="muted small">{t("settings.webdavPasswordHint")}</p>

        <div className="button-row">
          <button disabled={webdavBusy} onClick={() => void onWebdavTest()}>
            {t("settings.webdavTest")}
          </button>
          <button
            className="ghost"
            disabled={webdavBusy || !webdav.url.trim()}
            onClick={() => void onWebdavSync()}
          >
            {t("settings.webdavSync")}
          </button>
        </div>

        {webdavStatus ? <p className="muted small">{webdavStatus}</p> : null}

        {webdavConflicts.length > 0 ? (
          <div>
            <p className="muted small">{t("settings.webdavConflicts")}</p>
            {webdavConflicts.map((conflict) => {
              const chosen = decisions[conflict.path] ?? {};
              // "Keep both" only means something for a task; a setting or a
              // category has one value per key, not a second copy to keep.
              const choices: MergeDecision[] =
                conflict.kind === "tasks" ? ["local", "remote", "both"] : ["local", "remote"];
              const ready =
                conflict.items.length > 0 &&
                conflict.items.every((item) => chosen[item.id] !== undefined);

              return (
                <div className="conflict-card" key={conflict.path}>
                  <div className="conflict-head">
                    <code>{conflict.path}</code>
                    <span className="muted small">
                      {t(`settings.webdavKind_${conflict.kind}`)}
                    </span>
                  </div>

                  {conflict.items.length > 0 ? (
                    <ul className="conflict-list">
                      {conflict.items.map((item) => (
                        <li className="conflict-item" key={item.id}>
                          <span className="conflict-label" title={item.fields.join(", ")}>
                            {item.label}
                          </span>
                          <span className="conflict-side">
                            <b>{t("settings.webdavMine")}</b> {item.local}
                          </span>
                          <span className="conflict-side">
                            <b>{t("settings.webdavTheirs")}</b> {item.remote}
                          </span>
                          <div className="conflict-choices" role="group" aria-label={item.label}>
                            {choices.map((choice) => (
                              <button
                                key={choice}
                                type="button"
                                className={chosen[item.id] === choice ? "chip active" : "chip"}
                                aria-pressed={chosen[item.id] === choice}
                                disabled={webdavBusy}
                                onClick={() => choose(conflict.path, item.id, choice)}
                              >
                                {t(`settings.webdavDecision_${choice}`)}
                              </button>
                            ))}
                          </div>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="muted small">{t("settings.webdavConflictNoItems")}</p>
                  )}

                  {conflict.copy ? (
                    <p className="muted small">
                      {t("settings.webdavConflictCopy", { path: conflict.copy })}
                    </p>
                  ) : null}

                  <div className="button-row">
                    <button
                      className="ghost"
                      disabled={webdavBusy || !ready}
                      onClick={() => void onWebdavResolve(conflict, chosen)}
                    >
                      {t("settings.webdavApplyConflict")}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : null}
      </section>

      <section className="settings-card">
        <h2>{t("settings.ai")}</h2>
        <p className="muted small">{t("settings.aiHint")}</p>

        <label className="checkbox">
          <input
            type="checkbox"
            checked={ai.enabled}
            onChange={(event) => onAiPatch({ enabled: event.currentTarget.checked })}
          />
          <span>{t("settings.aiEnabled")}</span>
        </label>

        <label className="field">
          <span>{t("settings.aiApiKey")}</span>
          <input
            type="password"
            value={ai.apiKey}
            onChange={(event) => onAiPatch({ apiKey: event.currentTarget.value })}
            placeholder="sk-ant-…"
            autoComplete="off"
            spellCheck={false}
          />
        </label>
        <p className="muted small">{t("settings.aiApiKeyHint")}</p>

        <label className="field">
          <span>{t("settings.aiProtocol")}</span>
          <select
            value={ai.protocol}
            onChange={(event) => onAiPatch({ protocol: event.currentTarget.value as AiConfig["protocol"] })}
          >
            <option value="anthropic">{t("settings.aiProtocolAnthropic")}</option>
            <option value="openai">{t("settings.aiProtocolOpenai")}</option>
          </select>
        </label>
        <p className="muted small">{t("settings.aiProtocolHint")}</p>

        <label className="field">
          <span>{t("settings.aiBaseUrl")}</span>
          <input
            value={ai.baseUrl}
            onChange={(event) => onAiPatch({ baseUrl: event.currentTarget.value })}
            placeholder={
              ai.protocol === "openai" ? "https://api.openai.com/v1" : "https://api.anthropic.com"
            }
            autoComplete="off"
            spellCheck={false}
          />
        </label>
        <p className="muted small">{t("settings.aiBaseUrlHint")}</p>

        <label className="field">
          <span>{t("settings.aiModel")}</span>
          <input
            list="ai-model-presets"
            value={ai.model}
            onChange={(event) => onAiPatch({ model: event.currentTarget.value })}
            autoComplete="off"
            spellCheck={false}
          />
          <datalist id="ai-model-presets">
            <option value="claude-opus-5-5" />
            <option value="claude-sonnet-5-5" />
            <option value="claude-haiku-5-5" />
            <option value="gpt-4.1-mini" />
            <option value="deepseek-chat" />
          </datalist>
        </label>
        <p className="muted small">{t("settings.aiModelHint")}</p>
        <p className="muted small">{t("settings.aiPrivacy")}</p>
      </section>

      <section className="settings-card">
        <h2>{t("settings.categories")}</h2>
        <ul className="category-list">
          {categories.map((category) => (
            <li key={category.id}>
              <span className="dot" style={{ background: category.color }} />
              <span>{category.nameZh}</span>
              <span className="muted">/ {category.nameEn}</span>
              <div className="spacer" />
              <button className="ghost small" onClick={() => void onArchiveCategory(category.id)}>
                {t("actions.delete")}
              </button>
            </li>
          ))}
        </ul>
        <form className="category-form" onSubmit={addCategory}>
          <input placeholder={t("settings.categoryNameZh")} value={nameZh} onChange={(event) => setNameZh(event.currentTarget.value)} />
          <input placeholder={t("settings.categoryNameEn")} value={nameEn} onChange={(event) => setNameEn(event.currentTarget.value)} />
          <input type="color" value={color} onChange={(event) => setColor(event.currentTarget.value)} aria-label="color" />
          <button type="submit">{t("settings.addCategory")}</button>
        </form>
      </section>
    </div>
  );
}
