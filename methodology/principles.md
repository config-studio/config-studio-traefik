# 10 принципов doubled-graph

Все 10 — **обязательные**. Принципы адаптированы из GRACE (osovv) с обоснованиями из BlackboxBook и собственных решений по миграции/дрейфу.

---

## 1. Явный замысел первичен

Любой код — следствие утверждённого артефакта замысла. Никакой кодогенерации без утверждённого замысла: требования в `.grace/context/requirements.xml`, записи `M-*` в `.grace/graph/main.xml` и бандл изменения `C-*` (`.grace/changes/active/C-*/spec.xml` + `plan.xml`).

**Почему:** декомпозиция «требование → архитектура → контракт → код» снижает объём галлюцинаций и делает их отлавливаемыми на ранних этапах. BlackboxBook гл. 9 (декомпозиция как защита от blackbox-поведения).

**Как применять:** в **режиме `migration`** замысел восстанавливается из существующего кода через reverse-engineering (см. `workflow.md § migrate`). Но и там требование одобряется человеком до того, как начинаются новые правки.

---

## 2. Синтез по утверждённому чертежу

Каждый артефакт подтверждается человеком перед тем, как становится входом для следующего шага.

**Approval-точки workflow'а** (см. `approval-checkpoints.md`):
- архитектура модулей — после драфта записей `<M-*>` в `.grace/graph/main.xml`;
- черновик verification — после драфта записей `<V-M-*>` в `.grace/verification/main.xml`;
- бандл изменения — `spec.xml` + `plan.xml` в `.grace/changes/active/C-*/`, статус `draft` → `approved`, перед началом кодогенерации;
- contract-change — каждое изменение публичной сигнатуры / pre/post / invariant;
- drift-resolution в `post_migration` — каждый item drift'а решается явно (new req / bug / defer).

**Это — нередкие редкие ворота, это базовая частота.** Если хотя бы один gate пропущен — методология нарушена.

---

## 3. Семантический каркас кода

Код размечен парными якорями:

- **Файл:** `START_MODULE_CONTRACT` / `END_MODULE_CONTRACT`, `START_MODULE_MAP` / `END_MODULE_MAP`.
- **Функция:** `START_CONTRACT: functionName` / `END_CONTRACT: functionName`.
- **Блок:** `START_BLOCK_NAME` / `END_BLOCK_NAME` (≤ 500 токенов, имена уникальны в файле). В C#/VB якорь несётся меткой нативного `#region START_BLOCK_NAME` / `#endregion END_BLOCK_NAME` — единый синтаксис, дающий и IDE-folding, и парный якорь (см. `language-adapters/csharp.md §3.1`).
- **История:** `START_CHANGE_SUMMARY` / `END_CHANGE_SUMMARY` (в 4.x необязательна: `CHANGE_SUMMARY`/`LAST_CHANGE` линтер не требует).

**`MODULE_CONTRACT` обязателен** в каждом размеченном файле; поля `PURPOSE`, `SCOPE`, `DEPENDS`, `LINKS` — обязательные. `LINKS` содержит `M-*` — это единственная связь «файл ↔ модуль» в GRACE 4. `ROLE` и `MAP_MODE` согласованы: `RUNTIME`→`EXPORTS`, `TEST`→`LOCALS`, `BARREL`→`SUMMARY`, `CONFIG`→`NONE`, `TYPES`→`EXPORTS`, `SCRIPT`→`LOCALS`. Verification-якоря `V-M-*` в коде **не** пишутся — они живут в `.grace/verification/main.xml`.

**Почему:** разметка — контракт с ИИ, а не стилистика. BlackboxBook гл. 7: без семантического каркаса RAG-поиск и impact-анализ неточны, ИИ «галлюцинирует контекст».

**Синтаксис комментария — по языку** (см. `language-adapters/*.md`).

---

## 4. Контекст через граф знаний

Методология использует **два графа**:

- **Declared graph** — `.grace/graph/main.xml` (`index.xml` — таблица маршрутов `GD-*` → документы), пишется ИИ по плану. Отражает замысел.
- **Computed graph** — строится `codegraphcontext` из AST. Отражает факт.

Оба графа **существуют одновременно** и сверяются `detect_changes` (см. `tools.md §2`). Это принципиальное отличие doubled-graph от upstream GRACE, где есть только declared.

---

## 5. Двойное назначение разметки

Якоря — и шаблон для генерации, и индекс для RAG-навигации.

- При генерации: ИИ получает контракт и пишет код внутри anchors.
- При поддержке: `doubled-graph file show --contracts --blocks` достаёт только релевантные куски файла, не весь файл.
- При impact-анализе: computed-graph узлы мапятся на якоря через line-range.

Выкинуть якоря — потерять обе возможности.

---

## 6. Пропорциональная гранулярность

Глубина разметки и объём логов растут с критичностью модуля:

| Класс модуля | Комментарий | Якоря | Логи |
|---|---|---|---|
| Критический (payment, auth, data-integrity) | полный контракт + блоки | все три уровня | DEBUG-уровень, включая belief_state |
| Стандартный | контракт + ключевые блоки | уровни файла и функции | INFO-уровень |
| Вспомогательный (helpers, formatting) | минимальный контракт | уровень файла | WARN+ |

Класс модуля фиксируется в `M-*` записи `.grace/graph/main.xml` (`Summary`) и в `<Priority>` его `V-<M-id>` в `.grace/verification/main.xml` — отдельного поля `criticality` в модели 4.x нет, машинно-читаемый носитель критичности — приоритет verification. Инструменты (`doubled-graph impact`, `grace module health`) используют его для risk-level.

---

## 7. Код — живой документ

Изменение кода или контракта автоматически триггерит обновление связанного артефакта:

- skill `doubled-graph-after-edit` шаг 2 — агент оформляет бандл `C-*` (spec + plan) и правит `.grace/graph/main.xml` / `.grace/verification/main.xml` под новые экспорты/контракт.
- `doubled-graph.analyze(mode="incremental")` — инкрементальный пересчёт computed graph.
- Git hook `post-commit` — запускает analyze автоматически. В Claude Code — дополнительно PostToolUse-hook, сокращающий stale-окно до секунд.

Если синхронизация не происходит — методология нарушена (молчаливый дрейф).

---

## 8. Наблюдаемое belief-state

Каждый узел ИИ-потока вербализирует, что ИИ «думает» в этой точке. Не скрытое рассуждение, а лог-событие, привязанное к якорю.

```json
{
  "anchor": "validateUser:BLOCK_DECODE_JWT",
  "event": "llm_belief",
  "belief": "JWT payload trusted, clock-skew tolerance 60s",
  "timestamp": "2026-04-18T10:22:04Z",
  "session_id": "…"
}
```

**Почему:** без этого отладка инцидента, в котором ИИ принял неочевидное решение, невозможна. BlackboxBook гл. 13 (LDD + антигаллюцинационный контур).

**Что не делаем:** не гоним OpenTelemetry GenAI как обязательный (решение 2026-04-17: OTel GenAI dropped). Используем свой минимальный набор полей, см. `artifacts.md § Structured logs`.

---

## 9. Сквозная прослеживаемость

Цепочка: требование (свободный текст в `.grace/context/requirements.xml`) → `M-xxx` (модуль в `.grace/graph/main.xml`) → `V-<M-id>` (verification в `.grace/verification/main.xml`) → `LINKS: M-xxx` в `MODULE_CONTRACT` кода → якорь в коде → лог-событие в production.

**Следствие:** ни один живой лог нельзя прочитать, не найдя, из какого требования он растёт. Ни один модуль нельзя удалить, не убрав его `V-M-*` и не поправив `LINKS` в файлах, которые на него ссылаются.

`doubled-graph lint` (внутри — `grace lint --path . --format json`) проверяет целостность цепочки: каждый `M-*` обязан иметь `V-<M-id>`, а `Depends`/`LINKS` — указывать на существующие якоря.

---

## 10. Управляемая автономия

- **Человек** — архитектор и верификатор: утверждает артефакты, принимает приёмочные gates, решает неоднозначные drift-случаи.
- **ИИ** — исполнитель в рамках каркаса: генерирует код по утверждённому плану, пишет тесты, размечает, обновляет `.grace/**` — напрямую через `Edit` в режиме `migration` и через утверждённый бандл `C-*` в `post_migration` (см. skill `doubled-graph-after-edit`).

**Граница:** approval-точки (принцип 2). Автономия ИИ ограничена тем, что человек уже утвердил. За пределами — останавливаемся и спрашиваем.

---

## Операционный паттерн — externalize state

Не принцип, но обязательная техника для всех многошаговых промптов с пользовательским диалогом (intent-интервью, reconstruct-intent, drift-resolution с многократным «спросить»):

**Всё накопленное состояние (ответы пользователя, промежуточные решения) пишется в scratchpad-файл на диске**, не полагается на историю чата.

**Почему:** локальные модели среднего размера теряют данные из середины контекста. Длинная сессия (> 8K токенов) → ответы из начала начинают галлюцинироваться моделью при финальном синтезе.

**Где:** `.doubled-graph/drafts/<имя-процесса>.md` — append-only markdown.

**Когда читать:** каждый промпт, который синтезирует финальный артефакт (`.grace/**`, `AGENTS.md`), **явно начинается** с чтения соответствующего scratchpad'а.

**Когда архивировать/удалять:** рекомендация — перемещать в `.doubled-graph/drafts/_archive/<дата>/` в финальном `post-init-sync` / `validation-gates`. Удалять не стоит: scratchpads фиксируют историю решений, полезны для постмортем-анализа. Автоматически ничего не делать — пользователь может возобновить прерванную сессию.

**Где применён (reference):**
- `prompts/new-project/01-intent-interview.md` → `interview.md`.
- `prompts/new-project/04-development-plan.md` → `plan.md` (продолжается в `05-verification-plan.md`).
- `prompts/migrate-existing-project/01-discover.md` → `discover.md`.
- `prompts/migrate-existing-project/02-reconstruct-intent.md` → `intent-recovery.md`.
- `prompts/migrate-existing-project/03-draft-plan.md` → `plan-draft.md` (продолжается в `05-verification-and-logs.md`).
- `prompts/migrate-existing-project/04-markup-codebase.md` → `markup-progress.md`.
- `prompts/maintenance/on-drift-detected.md` → `drift-session-<ISO>.md`.

В любом новом промпте с длинным пользовательским диалогом или многошаговым накоплением — **обязан** применяться этот паттерн.

---

## Что НЕ является принципом

- **Tool-agnostic методология.** Это не принцип, это миф. doubled-graph — precondition-bound, см. `README.md`.
- **Frontier-first.** Целимся в локальные модели среднего размера, см. `runtime-adapters/local-llm.md`.
- **Zero-approval.** Даже в профиле `fast` остаётся up-front approval. Zero-approval нарушает принцип 2.
- **OpenTelemetry GenAI по умолчанию.** Рекомендуется, но не обязателен. См. memory/project_otel_dropped.md.
