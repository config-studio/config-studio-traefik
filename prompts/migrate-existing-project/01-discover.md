# 01 — Discover

**Роль ИИ:** понять, что за проект, без догадок. Только факты.

---

## Externalize state

Discover накапливает метрики, список файлов, hotspots, найденные docs, тесты, infra — легко 8+ секций. К финальному саммари на шаге 8 локальная модель забудет половину фактов. Веди файл:

- `.doubled-graph/drafts/discover.md` — append-only по ходу шагов 1–7.
- Шаг 8 (саммари пользователю) **читает** из этого файла, не восстанавливает по памяти.
- Файл **не удаляется** после discover — его читают шаги 02–03 (reconstruct-intent и draft-plan), чтобы не запрашивать метрики заново.

Формат:

```markdown
# Discovery — draft
Started: <ISO>
Status: in-progress | completed

## 0. Project kind & legacy artifacts
- `doubled-graph status --repo .` → artifacts.project_kind: none | grace3 | grace4
- legacy docs найдены: <список или «нет»>
- `doubled-graph migrate check` (только grace3): modules=<N>, verifications=<K>, placeholders=<P>
- unsupported/ambiguities из отчёта миграции: <список>

## 1. AGENTS.md status
- <существует / создан / phase-блок добавлен>

## 2. Analyze (doubled-graph)
- Mode: full
- Duration: <ms>
- Symbols: <N>, Edges: <M>, Clusters: <K>

## 3. Metrics
- LOC: ...
- Languages: ...
- Top-10 hotspots (by find_all_callers):
  - ...

## 4. Docs found
- README.md (size, last modified)
- ARCHITECTURE.md (...)
- Claims extracted: ...

## 5. Tests
- Directory: ...
- Count: ..., Coverage (if available): ...
- Areas covered / uncovered: ...

## 6. Logs & observability
- Framework: ...
- Format: structured | ad-hoc
- Example log lines: ...

## 7. Infrastructure
- CI: ...
- Hooks: ...
- Docker / k8s: ...

## 8. Summary (user-shown)
- <финальный блок из шага 8>

## Risks flagged
- ...
```

---

## Шаги

**Шаг 0 — определи тип проекта (обязательно первым).**

```bash
doubled-graph status --repo .
```

Читай JSON, а не exit code:

- `"artifacts": {"project_kind": "none", "legacy_documents": []}` → ветка **(а)** из `00-entry-prompt.md`: `.grace` создаётся командой `doubled-graph setup --repo .` на шаге 02.
- `"project_kind": "grace3"` + непустой `legacy_documents` → ветка **(б)**: сначала диагностика.

```bash
doubled-graph migrate check --repo .
```

Это read-only инвентарь: `modules`, `verifications`, `placeholders` (модули, которым создадут пустые `V-<M>`), `markup_pending` (файлы, где `LINKS` не содержит `M-*`), `renamed_verifications`, `unsupported` (конструкции GRACE 3 без аналога: `UC-*`, `ExecutionPacket`, `GraphDelta`, `VERSION="..."` и т.п.). Ничего не пишет — можно запускать сколько нужно.

- `"project_kind": "grace4"` → миграция не нужна. Скажи пользователю и переходи на `prompts/maintenance/on-before-edit.md`.

Запиши результат в `.doubled-graph/drafts/discover.md § 0`.

**Шаг 1 — AGENTS.md phase.**

Добавь (или создай) `AGENTS.md` с phase-блоком в режиме `migration`:

```markdown
<!-- doubled-graph:phase:start -->
## doubled-graph phase
phase: migration
updated: <сегодня>
<!-- doubled-graph:phase:end -->
```

Если `AGENTS.md` уже есть — добавь блок, не затирай остальное.

**Шаг 2 — первичный analyze.**

```bash
doubled-graph analyze --mode full --repo .
```

Это может занять минуты на больших репо. Подожди.

> Если analyze падает на legacy-проекте — это не блокер discover: computed graph можно не получить. Зафиксируй ошибку в scratchpad и продолжай по фактам из файлов. Артефакты `.grace` появятся на шаге 02.

**Шаг 3 — собери метрики:**

- LOC по языкам (`tokei` / `cloc` / язык-встроенные tools);
- количество файлов, модулей;
- из computed graph — количество символов, связей, кластеров;
- список топ-10 функций с наибольшим `find_all_callers` (= hotspots).

**Шаг 4 — прочитай README и любые ARCHITECTURE.md / docs/.**

Извлеки:
- **заявленное назначение** продукта;
- упомянутые акторы (users, admins, workers, external systems);
- упомянутые интеграции (external APIs, DBs);
- если есть — архитектурные диаграммы или описания.

Legacy `docs/*.xml` (если проект был на GRACE 3) — тоже источник claims: заявленные модули, критичность, команды тестов. Читай их **только для чтения**: ничего в `docs/` не правь и не пересоздавай.

Не верь слепо — документация могла устареть. Отметь как «claim», проверь коррелирует ли с computed graph.

**Шаг 5 — найди существующие тесты.**

- директория `tests/`, `__tests__/`, `spec/`, файлы `*_test.go`, `*.test.ts`, `test_*.py`, `*Tests.cs`, etc.
- посчитай coverage если доступно (инструмент есть в технологии).
- отметь, какие области кода покрыты, какие — нет.

**Шаг 6 — логи и observability.**

- есть ли structured logs?
- используется ли OpenTelemetry / structured logging framework?
- найди примеры log-строк, определи формат.

**Шаг 7 — инфраструктура.**

- есть ли CI (`.github/workflows/`, `.gitlab-ci.yml`, …)?
- есть ли hooks (`.git/hooks/`, `.husky/`, `lefthook.yml`)?
- есть ли Dockerfile / compose / k8s манифесты?

**Шаг 8 — саммари пользователю.**

Источник данных для саммари — **`.doubled-graph/drafts/discover.md`** (читай секции 0–7), не память. Покажи:

```
Discovery саммари:

PROJECT KIND: <none (bootstrap) | grace3 (legacy docs: N файлов)>
LANGUAGES:    <Python: 82%, TypeScript: 15%, Shell: 3%>
LOC:          <12 340>
MODULES:      <computed: 37 clusters by Leiden-like>
HOTSPOTS:     <топ-5 функций, где много callers — кандидаты на critical>
DOCS FOUND:   <README.md (2.1 KB), docs/API.md (4 KB)>
LEGACY DOCS:  <docs/knowledge-graph.xml → 18 модулей; docs/verification-plan.xml → 9 записей
               (или «нет — ветка bootstrap»)
TESTS:        <pytest tests/: 42 файла, coverage ~45%>
LOGS:         <Python stdlib logging, ad-hoc format, NOT structured>
CI:           <.github/workflows/ci.yml с 3 jobs>
HOOKS:        <нет>

Наиболее вероятный замысел проекта (из README):
  <1–2 предложения>

Главные риски миграции:
  - <1–3 пункта: например, "тесты покрывают только 45% — восстановленная verification будет неполной">
```

**Approval gate:**

> «Это твой проект, как я его вижу? Что нужно уточнить или добавить перед следующим шагом?»

Жди ответа. После подтверждения — прочитай `prompts/migrate-existing-project/02-reconstruct-intent.md` через Read tool и следуй его инструкциям.

---

## Анти-паттерны

- Не угадывай business intent из кода одного. Только из кода + README + ответов пользователя.
- Не делай рекомендаций по улучшению кода на этом шаге. Только факты.
- Не создавай `.grace/` шаблоны пока — это шаг 02, после определения типа проекта.
- **Не создавай и не правь `docs/*.xml`.** Legacy-документы GRACE 3 — только чтение; их перенос делает `doubled-graph migrate apply`, архивация — отдельное решение.
- Не запускай `migrate apply` на этом шаге: `check` — диагностика, `apply` — запись, он живёт в шаге 02.
