import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { AppLanguage, Category, NumberingStyle } from "../../domain/types";
import type { AppSettings } from "../../settings/store";

interface SettingsViewProps {
  settings: AppSettings;
  categories: Category[];
  deviceId: string;
  onLanguage: (language: AppLanguage) => Promise<void>;
  onChangeFolder: () => Promise<void>;
  onPatch: (patch: Partial<AppSettings>) => void;
  onAddCategory: (nameEn: string, nameZh: string, color: string) => Promise<void>;
  onArchiveCategory: (id: string) => Promise<void>;
}

const COLORS = ["#5b8def", "#e0a03a", "#7f8c9a", "#4bb37a", "#c96b9b", "#8a6bd1", "#4aa3a3", "#c0574f"];

export default function SettingsView({
  settings,
  categories,
  deviceId,
  onLanguage,
  onChangeFolder,
  onPatch,
  onAddCategory,
  onArchiveCategory,
}: SettingsViewProps) {
  const { t } = useTranslation();
  const [nameEn, setNameEn] = useState("");
  const [nameZh, setNameZh] = useState("");
  const [color, setColor] = useState(COLORS[0]);

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
        <button onClick={() => void onChangeFolder()}>{t("settings.changeFolder")}</button>
        <p className="muted small">
          {t("settings.deviceId")}: <code>{deviceId}</code>
        </p>
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
