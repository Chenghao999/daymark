# 08 · Report Template Specification

> 中文摘要：1.0 使用 Word 内置样式直接生成 DOCX；P1 引入外置模板，Daymark 只负责
> 替换占位符，不重建样式。本文定义占位符字典与校验规则。

## 1. 1.0 behaviour

The exporter builds a `docx` document with:

- `Title` style for the report title (`日报` / `Weekly Report`, …).
- `Heading 2` for the period label.
- An italic summary line with completed/planned counts.
- `Heading 1` per non-empty category, prefixed with the configured numbering.
- `List Bullet` items, with the date right-aligned later if needed.

The document is written atomically (`write_file_bytes`) so a sync client never
sees a half-written file.

## 2. Template model (P1)

A template is a `.docx` the user edits in Word. Daymark does not draw styles; it
only replaces placeholders.

### Placeholder dictionary

| Placeholder | Meaning |
|---|---|
| `{{title}}` | report title |
| `{{period}}` | period label |
| `{{generated_at}}` | generation timestamp |
| `{{completed_count}}` | number of completed items |
| `{{planned_count}}` | number of planned items |
| `{{sections}}` | all sections, rendered in order |
| `{{category_heading}}` | heading for the current section |
| `{{category_name}}` | category display name |
| `{{items}}` | bullet list for the current section |
| `{{item_text}}` / `{{item_date}}` | inside a repeated item block |

### Rules

- Placeholders are matched literally, including the double braces.
- Unknown placeholders are left untouched and reported in the validation panel.
- A template missing `{{sections}}` is invalid (the report would be empty).
- Section repetition: paragraphs containing `{{items}}` are repeated per item,
  preserving the paragraph's style.
- Chinese and English templates are separate files:
  `templates/report.zh-CN.docx` and `templates/report.en.docx`.

## 3. Numbering

- The numbering prefix is generated, not written in the template.
- `{{category_heading}}` already includes it (e.g. `一、项目开发`), so templates
  must not add their own numbering.
- Style is configured once in Settings and stored per device.

## 4. Validation

Before export:

1. Required placeholders present.
2. Template readable and a valid ZIP/OOXML.
3. At least one non-empty section, otherwise offer an empty report or cancel.

## 5. Storage

- Templates live in `<data folder>/templates/` so they travel with the data.
- A missing template falls back to the built-in exporter.
- The app never overwrites a user template.
