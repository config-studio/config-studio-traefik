# 04 — Markup codebase

**Роль ИИ:** добавить разметку якорями без изменения логики.

**КРИТИЧНО:** один коммит = один модуль. `git diff` должен содержать **только** якоря и комментарии, **никаких** изменений в коде.

---

## Externalize state

Разметка идёт по 10+ модулей, каждый — 9 под-шагов, user-clarifications для helper-функций, решения «пропустить / в DRIFT.md». Это самый длинный процесс миграции. Обязательный журнал:

- `.doubled-graph/drafts/markup-progress.md` — per-module статус, append-only.
- Возобновление прерванной миграции — открой файл, найди последний модуль со статусом `pending` или `in-progress`, продолжай оттуда.
- **Читает input**: `.doubled-graph/drafts/plan-draft.md` (список модулей + риск-класс + фазы из шага 03) и `.grace/changes/active/C-001-LEGACY-MARKUP/plan.xml` (задачи `T-###`).

Формат:

```markdown
# Markup progress
Started: <ISO>
Status: in-progress | completed
Reads-from: .doubled-graph/drafts/plan-draft.md

## Modules (in phase order)

### M-AUTH-VALIDATE (T-001, risk=critical)
- Status: committed
- Files: src/auth/validate.py
- MODULE_CONTRACT: done
- CONTRACT (functions): validate_user (done), refresh_token (done)
- BLOCKS: DECODE_JWT, CHECK_CLOCK_SKEW
- User clarifications: none
- grace lint: ✓ (0 findings)
- git diff review: semantic-change-free ✓
- Commit: abc1234
- artefact sync: ✓ (commit def5678)

### M-AUTH-TOKENS (T-001, critical)
- Status: in-progress
- ...

### M-BILLING-STRIPE (T-002, critical)
- Status: pending

### M-UTIL-FORMAT (T-002, helper)
- Status: pending
- Note: skip runtime-контракты, минимальный MODULE_CONTRACT

## Skipped modules
- M-WEIRD-GLUE — logic unclear, moved to DRIFT.md (D-MARKUP-001), will return after user input

## User clarifications log
- 2026-04-18T11:30: `format_address(addr)` helper → пользователь: «форматирует в canonical form per RFC 5321, используется в email sending»
```

---

## Порядок работы

Идём по задачам `T-###` из `.grace/changes/active/C-001-LEGACY-MARKUP/plan.xml`, внутри задачи — от **высокого** риск-класса к низкому.

Для каждого модуля из текущей задачи:

### Шаг 4.1 — Прочитай файлы модуля.

```bash
doubled-graph file show <path> --repo .
```

В legacy-коде обычно вернёт **пусто** (нет ещё якорей) — ок. Если `migrate apply` уже добавил `LINKS: M-*`, увидишь контракт.

### Шаг 4.2 — Составь `MODULE_CONTRACT`.

На основе:
- публичных экспортов (функции / классы, доступные извне);
- существующих docstring / comments;
- зависимостей (imports);
- тестов (они часто описывают то, что модуль делает).

Формат (ключи всегда UPPERCASE; `PURPOSE`, `SCOPE`, `DEPENDS`, `LINKS` обязательны):

```
# START_MODULE_CONTRACT
# MODULE: M-AUTH-VALIDATE
# PURPOSE: Валидирует входящий JWT и возвращает пользователя.
# SCOPE: src/auth/validate.py
# DEPENDS: M-AUTH-TOKENS
# LINKS: M-AUTH-VALIDATE
# ROLE: RUNTIME
# MAP_MODE: EXPORTS
# END_MODULE_CONTRACT

# START_MODULE_MAP
# validate_user - валидирует JWT и возвращает User или null
# END_MODULE_MAP
```

Правила, которые проверяет `grace lint`:
- `LINKS` содержит `M-*` — **единственная** связь файла с модулем. Значения `UC-*`, `V-M-*` движок игнорирует: файл без `M-*` в `LINKS` не прикрепляется ни к одному модулю (warning `markup.links-without-module`, drift `code_without_module`).
- `ROLE` ↔ `MAP_MODE` строго парой: `RUNTIME`→`EXPORTS`, `TEST`→`LOCALS`, `BARREL`→`SUMMARY`, `CONFIG`→`NONE`, `TYPES`→`EXPORTS`, `SCRIPT`→`LOCALS`.
- `MODULE_MAP` — строки `symbol - описание` (дефис с пробелами, не `(тип)`).
- Комментарийный префикс — по языку файла: `//` (C-family, Java, Go, Rust, TS, JS, C#), `#` (Python, Ruby, shell), `--` (SQL/Lua), `;` (Lisp), `<!-- -->` (HTML/XML/Vue).

Формат для конкретного языка — см. `methodology/language-adapters/<язык>.md`.

### Шаг 4.3 — Для каждой публичной функции составь `CONTRACT:fn`.

PURPOSE, INPUTS, OUTPUTS, SIDE_EFFECTS — из:
- текущей сигнатуры;
- тестов, покрывающих функцию;
- места вызова (callers).

Если функция — helper без документации, назначение определи командами в этом порядке: (1) `grep -nE "<имя функции>" src/ tests/` — по вызовам и аргументам; (2) `PURPOSE`/`SCOPE` модуля (`doubled-graph file show <path> --repo .`); (3) если ни то, ни другое не даёт ответа — запиши `PURPOSE: <имя функции> (назначение не определено)` и строку в `docs/DRIFT.md`; вопрос пользователю не задавай.

### Шаг 4.4 — Блоки для длинных функций.

Только если функция > 20 строк. Имена блоков — semantic, не scope-based (`BLOCK_DECODE_JWT`, а не `BLOCK_3`).

### Шаг 4.5 — `CHANGE_SUMMARY` (не обязателен).

Секция `CHANGE_SUMMARY`/`LAST_CHANGE` в GRACE 4 не обязательна — но если она есть, `LAST_CHANGE` внутри обязателен. При миграции удобно оставить след:

```
# START_CHANGE_SUMMARY
# LAST_CHANGE: <сегодня> — doubled-graph migration markup added (no behavior changes)
# END_CHANGE_SUMMARY
```

### Шаг 4.6 — Проверка.

```bash
doubled-graph lint --path .
```

Должен вернуть rc=0 и `summary.errors == 0`. Прямой вызов движка — `grace lint --path . --format json`. Если нет — фикс якорей (не кода).

### Шаг 4.7 — git diff ревью.

Покажи пользователю **полный diff** файла. Правило:
- все plus-lines — только комментарии/якоря;
- если есть plus-lines в коде (не комментарий) — **откати**, это семантическая правка.

В UI ИИ-клиента это сложно без visual-инструментов; попроси пользователя: «Посмотри git diff, что-то семантическое изменилось?»

### Шаг 4.8 — Коммит.

```bash
git add <file>
git commit -m "chore(markup): <M-id> module contract + anchors"
```

### Шаг 4.9 — синхронизация declared graph.

После каждого модуля — подтянуть `.grace/graph/main.xml` и `.grace/verification/main.xml` под реальные экспорты и пути модуля. В режиме `migration` это делается без вопросов через `Edit`:

1. Прочитай запись модуля: `doubled-graph module show <M-id> --with-verification --repo .`.
2. Обнови в `.grace/graph/main.xml` у своего `M-*`: `<Status>existing</Status>`, `<Path>` (фактический главный файл), `<Summary>` (настоящая цель модуля прозой), `<Depends>` (фактические зависимости).
3. Если появился новый `M-*` или `DF-*` — добавь строку в `<Owns>` `.grace/graph/index.xml` (ровно те якоря, что объявлены).
4. Заполни `<TestFiles><File>…</File></TestFiles>` записи `V-<M-id>` фактическими тестовыми путями (файлы должны существовать — иначе `verification.test-file-missing`).
5. Допиши изменённые пути в `<ObservedWriteScope>` активного `plan.xml`.

См. также skill `doubled-graph-after-edit` шаг 2 (тот же подход для day-to-day поддержки).

Ревью diff'а артефактов, коммит отдельно:

```bash
git add .grace/
git commit -m "chore(refresh): sync .grace after <M-id> markup"
```

---

## Что делать при сопротивлении

**Файл большой, много функций.** Не пытайся разметить всё за один commit. Одна функция = один логический шаг; файл целиком = один коммит (но не 20 файлов в одном commit).

**Код «странный», неясно, что он делает.** Не пиши `MODULE_CONTRACT` guess. Отметь в `docs/DRIFT.md` как `D-MARKUP-XXX — M-* unclear, skipping markup`. Пропусти этот модуль; вернёшься позже. Помни: пропущенный модуль = `missing_verification`/`code_without_module` в drift, миграция не закроется.

**Тесты не запускаются.** Markup всё равно разрешён (не меняем код), но зафиксируй в DRIFT.md как блокер перед переключением в `post_migration`.

**Пользователь пишет новый код во время миграции.** Прямо запрещено. Skip-новый-код ветку до окончания миграции. Если уже произошло — новый код размечается отдельно, как fresh generation (не migration).

**Нашлись `docs/*.xml` с несогласованной разметкой.** Ничего в `docs/` не правь: источник истины — `.grace/`. Legacy-документы остаются как история до отдельного решения об архивации.

---

## Переход

Когда **все модули** из `.grace/graph/main.xml` размечены и `doubled-graph lint --path .` проходит — прочитай `prompts/migrate-existing-project/05-verification-and-logs.md` через Read tool и следуй его инструкциям.
