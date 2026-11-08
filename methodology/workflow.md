# Workflow doubled-graph

Три сценария, один скелет.

## Общий скелет

```
            ┌────────────────────────────────────────────────────────┐
            │  requirements gather → .grace/context/*.xml (агент)     │
            │       ↓                                                │
            │  бандл C-*/spec.xml + plan.xml → approval-gate          │
            │       ↓                                                │
            │  code + markup (LINKS: M-*) по задачам T-###            │
            │       ↓                                                │
            │  verification: V-M-* записи + тесты                     │
            │       ↓                                                │
            │  declared graph sync (.grace/graph) + analyze           │
            │       ↺ (loop on drift, см. drift-and-priority.md)      │
            └────────────────────────────────────────────────────────┘
```

Все три сценария проходят эти стадии. Различается только **входная точка** и **что считается ground-truth** на первом шаге.

Ground-truth по режимам (см. `drift-and-priority.md`):

- **Новый проект** — с 1-го шага режим `post_migration`: артефакты = ground-truth.
- **Миграция** — режим `migration`: код = ground-truth, артефакты догоняют.
- **Поддержка** — режим тот, который установлен в `AGENTS.md` (обычно `post_migration` после завершения миграции).

---

## Сценарий 1. Новый проект

Entry-prompt: `prompts/new-project/00-entry-prompt.md`. Вся последовательность исполняется агентом через свои `Read`/`Edit`/`Write`/`Bash` + наши MCP-tools (`analyze`, `impact`, `context`, `detect_changes`, `lint`, `module_show`, `file_show`, `health`).

1. **Intent-интервью** (человек ↔ ИИ). ИИ задаёт ~10 вопросов: продукт, аудитория, нефункциональные ограничения, стек-предпочтения. Глубина заполнения артефактов — всегда максимальная (см. `auto-scaling.md`), объём зависит от реального количества use-cases и модулей.
2. **Bootstrap** — `doubled-graph setup --repo .` ставит движок 4.2.1, пустой `.grace`-скелет, MCP и hooks. Затем агент заполняет через `Write`/`Edit`:
   - `.grace/context/{requirements,technology,principles,deployment,ux-guidelines}.xml` — все пять обязательны (неприменимый артефакт помечается `<Applicability>not-applicable</Applicability>`, а не пропускается),
   - `.grace/graph/{index,main}.xml` и `.grace/verification/{index,main}.xml` (форматы — `methodology/artifacts.md`),
   - `AGENTS.md` с phase-блоком (`phase: post_migration`).
3. **Архитектура модулей** — агент по сформулированным требованиям драфтит `<M-*>` в `.grace/graph/main.xml` и закрывает `<Owns>` в `graph/index.xml` (список якорей должен совпадать с документом ровно). **Approval-gate**: пользователь подтверждает список модулей, `Depends`, `Exports`.
4. **Verification draft** — агент драфтит `V-<M-id>` записи в `.grace/verification/main.xml` и `<Owns>` в `verification/index.xml`. **Approval-gate**: пользователь подтверждает покрытие (каждый `M-*` имеет свой `V-M-*`).
5. **План исполнения** — агент создаёт бандл `.grace/changes/active/C-*/` с `spec.xml` (Summary/Goals/Constraints/NonGoals/AcceptanceCriteria/AffectedAreas/VerificationIntent) и `plan.xml` с задачами `T-###`. **Approval-gate**: пользователь подтверждает план.
6. **Генерация кода** — по задачам `T-###`. ИИ размечает файлы якорями, включая `LINKS: M-*` (см. `artifacts.md § Разметка кода`). После каждой пачки файлов — `doubled-graph.analyze(mode="incremental", paths=[...])`.
7. **Первичный `doubled-graph.analyze(mode="full")`** — создаёт computed graph поверх только что написанного кода.
8. **Verification** — заполнить `V-M-*` реальными `TestFiles`/`Command`/`Scenario` (пустые заглушки дают warning `verification.placeholder`); для модулей без покрытия активируй skill `doubled-graph-verify`. Прогон тестов через Bash.
9. **Закрытие бандла** — `Status` в `spec.xml` → `applied`, `ObservedWriteScope` в `plan.xml` заполняется по факту, каталог переносится в `.grace/changes/archive/`.
10. **Hooks** — `doubled-graph init-hooks` ставит git post-commit и (если Claude Code) PostToolUse; `setup` делает это автоматически, повторный вызов безопасен.

С этого момента переход в **Сценарий 3 — Поддержка**.

---

## Сценарий 2. Миграция существующего

Entry-prompt: `prompts/migrate-existing-project/00-entry-prompt.md`.

**Контекст:** код существует, артефактов GRACE 4 нет (возможен legacy-набор `docs/*.xml`).

1. **Обнаружение** — `prompts/migrate-existing-project/01-discover.md`. ИИ запускает `doubled-graph.analyze(mode="full")` на существующем коде. Получает computed-graph, считает метрики (модули по кластерам, LOC, языки), проверяет наличие legacy-документации (README, ARCHITECTURE.md, `docs/`).
2. **Инвентарь миграции** — `doubled-graph migrate check`. Отчёт отвечает на вопросы: какой сейчас `projectKind`, сколько модулей и верификаций переносится, какие `MODULE_CONTRACT` остались без `LINKS: M-*`, что попадёт в `ambiguous_links`/`unsupported`. Ничего не пишется.
3. **Миграция артефактов** — `doubled-graph migrate apply` (перед первым прогоном — `--dry-run`). Пишется `.grace`: пять context-файлов, `graph`, `verification`, каталоги `changes`; для модулей без верификации — пустые `V-<M>` заглушки; в код дописывается `LINKS: M-*` (отключается `--no-markup-fix`). Legacy-документы не удаляются и не переписываются. Отчёт: `.doubled-graph/migrations/grace3-to-grace4.json`. **Approval-gate: результат миграции** — пользователь смотрит отчёт и подтверждает имена модулей и связи.
4. **Восстановление замысла** — `02-reconstruct-intent.md`. ИИ по коду + README восстанавливает draft `.grace/context/requirements.xml` (свободным текстом, без якорей `UC-*`) и задаёт пользователю 5–10 уточняющих вопросов (что намерение, что случайность). **Approval-gate: требования**.
5. **Постепенная разметка** — `04-markup-codebase.md`. **Критичный нюанс:** в режиме `migration` не правим логику, только добавляем якоря и контракты, без семантических изменений. После каждого файла — `Edit` `.grace/graph/main.xml`, если контракт или `Depends` разошлись с фактом (см. skill `doubled-graph-after-edit` шаг 2).
6. **Заполнение верификаций** — `05-verification-and-logs.md`. Пустые `V-<M>` от миграции заполняются реальными `TestFiles`/`Command`/`Scenario` (skill `doubled-graph-verify`); если legacy-тестов нет — минимальный набор для критических модулей. Выдуманная команда запрещена: она превращает «не проверено» в «проверено».
7. **Закрытие содержательных пробелов** — `prompts/upgrade-methodology/01-content-gaps.md`. Готовый промпт для ИИ: `map_pending` (`MODULE_MAP` по реальным экспортам), `placeholders` (команды из существующих тестов), `markup_pending` (`LINKS: M-*`), затем `lint` без errors, `module health` без `blocked` у критичных модулей, `migrate check` с пустыми `map_pending`/`placeholders`.
8. **Gates** — `06-validation-gates.md`. Критерии готовности миграции: `grace lint --path . --format json` без ошибок (`summary.errors = 0`), `grace status --path . --json` даёт `projectKind = grace4` и пустой `integrity.errors`, все модули имеют `MODULE_CONTRACT` и непустой `V-M-*`, `doubled-graph.detect_changes()` пуст.
9. **Архивирование legacy** — `docs/*.xml` переносятся в `docs/legacy/` или удаляются. **Отдельное одобрение человека**: два источника истины рядом — риск, но удаление legacy без подтверждения недопустимо.
10. **Переключение режима** — `doubled-graph phase set post_migration --reason "migration complete"`. С этого момента политика дрейфа разворачивается (артефакты = ground-truth).

**Persistence режима между волнами миграции:** `phase: migration` сохраняется **на весь период миграции**, через все волны и коммиты. Не сбрасывается per wave. Каждая волна заканчивается синхронизацией `.grace/graph`, но режим остаётся `migration` до финального `06-validation-gates.md`. Это важно: если режим случайно переключился на `post_migration` посреди миграции, следующая волна будет блокировать правки, которые легитимны для миграционного контекста. Если это произошло — откат через `DRIFT.md` запись (см. `drift-and-priority.md § Переключение режима`).

**Типичные провалы миграции** (учтено в промптах):

- Попытка разметить весь репозиторий сразу. *Митигация:* идём по кластерам computed-graph, начинаем с критичных.
- «ИИ понял замысел неправильно» — человек спорит с восстановленными требованиями. *Митигация:* Approval-gate на требованиях; фиксация разногласий в `docs/DRIFT.md`.
- Случайные семантические правки во время разметки. *Митигация:* `04-markup-codebase.md` явно запрещает менять логику; `git diff` ревью каждого файла.
- Пустые `V-<M>` заполнены придуманной командой «чтобы gate позеленел». *Митигация:* пустая заглушка честнее — она видна как `verification.placeholder` в `grace module health` и в drift, а фиктивный прогон прячет отсутствие проверки.

---

## Сценарий 3. Обновление версии методики (1.9.x → 2.0)

Entry-prompt: `prompts/upgrade-methodology/00-entry-prompt.md`.

**Контекст:** методология уже внедрена, но пакет старый (1.9.x, артефакты GRACE 3 в `docs/*.xml`). Это **не** миграция с нуля и **не** новый проект: legacy-артефакты и разметка уже существуют, сценарий 2 не запускается.

1. **Обновление пакета** — `pipx upgrade doubled-graph` (выполняет человек).
2. **Проверка состояния** — `doubled-graph status --repo .`: `grace_engine.detected.version` (нужна 4.x), `grace_engine.upgrade_required`, `artifacts.project_kind` (`grace3`/`grace4`/`none`).
3. **Обновление движка и артефактов** — `doubled-graph setup --repo .`: ставит `@osovv/grace-cli@4.2.1` (3.x обновляется), при `grace3` переносит `docs/*.xml` → `.grace` (legacy не меняется и не удаляется), добавляет `LINKS: M-*`, выравнивает `ROLE`↔`MAP_MODE`, обновляет `prompts/` и `methodology/`, пишет отчёт.
4. **Проверка** — `doubled-graph migrate check --repo .` (`map_pending`/`placeholders`/`markup_pending`), `doubled-graph lint --repo .` (`summary.errors`).
5. **Закрытие содержательных пробелов** — `prompts/upgrade-methodology/01-content-gaps.md`: `MODULE_MAP` по реальным экспортам, `V-<M>` командами из существующих тестов, `LINKS: M-*`; финал — CLI-проверки (`lint`, `migrate check`, `detect-changes`, `health`, `module health`).
6. **Возврат в обычный цикл** — `prompts/maintenance/on-before-edit.md`; архивация legacy `docs/` — отдельное решение с бэкапом.

**Детерминизм:** каждое решение подтверждается командой. Если команда не подтверждает данные — значение не пишется, ставится `Priority: low` / `MAP_MODE: NONE`+`ROLE: CONFIG`, факт фиксируется в `docs/DRIFT.md` и в отчёте. Вопросов пользователю по ходу не задаётся.

**Типичные провалы:**

- Запуск `prompts/migrate-existing-project/*` «на всякий случай» — это другой сценарий: лишние шаги перезапишут замысел вместо переноса.
- Оставшийся движок 3.x (`upgrade_required: true`) — `lint` даст `project.grace3-detected`; лечится `npm install -g @osovv/grace-cli@4.2.1` и повторным `setup`.
- Legacy `docs/` удалены до зелёного `lint` — теряется единственный источник сверки; удаление только после проверок и с бэкапом.

---

## Сценарий 4. Поддержка (день-в-день)

Entry-prompts: skills семейства `doubled-graph-*` (см. `tools.md §1`). Предполагается: режим `post_migration`, hooks установлены, computed/declared graphs согласованы.

### Поток «новая фича»

1. Человек/ИИ формулирует изменение в `.grace/context/requirements.xml` (новый use-case текстом) через `Edit`.
2. ИИ создаёт бандл `.grace/changes/active/C-*/spec.xml` и переводит его `draft` → `approved`. **Approval-gate**: пользователь подтверждает Goals / NonGoals / AcceptanceCriteria.
3. ИИ пишет `plan.xml`: `BaselineAssertions`, `TargetAssertions`, `DurableScope`, задачи `T-###`. **Approval-gate**: пользователь подтверждает план.
4. ИИ драфтит обновление `.grace/graph/main.xml` (новые/изменённые `M-*`) и `<Owns>` в `graph/index.xml` через `Edit`. **Approval-gate**: пользователь подтверждает архитектуру.
5. Код + разметка (`LINKS: M-*`) + `V-M-*` + тесты — по задачам `T-###`. После каждой правки — skill `doubled-graph-after-edit`.
6. Коммит → `post-commit` hook → `doubled-graph analyze --mode incremental`.
7. Pre-commit (опц., рекомендовано в CI): `doubled-graph detect-changes --scope staged` + `doubled-graph lint`.
8. Закрытие: атрибут `status` бандла → `applied`, `ObservedWriteScope` по факту, каталог → `.grace/changes/archive/`.

### Поток «обнаружен дрейф»

Триггер: `doubled-graph.detect_changes()` вернул непустой drift ИЛИ пользователь поправил код вручную и hook зарегистрировал это в логах.

Процесс — skill `doubled-graph-drift`:

1. ИИ смотрит тип дрейфа (`code_without_module` / `module_without_code` / `contract_mismatch` / `stale_crosslinks` / `missing_verification` / `markup_missing`).
2. Применяет политику (см. `drift-and-priority.md`):
   - В `post_migration`: спрашивает пользователя «новое требование или баг?».
   - «Новое требование» → возврат в поток «новая фича», шаг 2.
   - «Баг» → `Edit` кода под существующий контракт + запись в бандл `C-*` (или в `CHANGE_SUMMARY`, если он есть).
   - «Не знаю» → запись в `docs/DRIFT.md`, модуль блокируется для правок ИИ до разрешения.
3. В `migration` — `Edit` `.grace/graph/main.xml` (и `<Owns>`) обновляет артефакты под код без вопросов.

### Поток «ручная правка человека»

Триггер: `prepare-commit-msg` hook (если включён) распознал trailer `DG-Authored: human` или `mixed`, либо пользователь явно говорит «я поправил X сам».

Процесс — skill `doubled-graph-manual-edit`:

1. `doubled-graph.analyze(mode="incremental", paths=[touched])` (если post-commit hook ещё не запустился).
2. `doubled-graph.detect_changes(scope="branch", base_ref="main")` — если drift ∅, ничего не делаем.
3. Если drift есть — переход в skill `doubled-graph-drift`.
4. `doubled-graph.lint()` — проверка якорей, `Owns` и покрытия `M-*` → `V-M-*`.
5. Запись `(DG-Authored: human)` в `CHANGE_SUMMARY`, если он есть в файле; иначе — в бандл `C-*` или в `DRIFT.md`.

### Перед любой правкой кода ИИ

Skill `doubled-graph-before-edit`:

1. `doubled-graph.impact(target=<символ>, direction="upstream")`.
2. Если `risk.level ∈ {HIGH, CRITICAL}` — остановка, показываем пользователю, ждём подтверждения.
3. Иначе — продолжаем правку.

### После правки (до коммита)

Skill `doubled-graph-after-edit`:

1. `doubled-graph.analyze(mode="incremental", paths=[touched])` (PostToolUse hook в Claude Code делает автоматически).
2. Если правка семантическая — `Edit` `.grace/graph/main.xml` под новые `Exports`/`Depends` и, при необходимости, `<Owns>` в `graph/index.xml`.
3. `doubled-graph.detect_changes(scope="staged")` — проверка дрейфа перед коммитом.
4. `doubled-graph.lint()` — проверка якорей и покрытия.
5. Прогон `V-M-*` тестов через Bash.
6. Контракт-change check + commit.

---

## Приёмные критерии каждого шага

Формализованы в `approval-checkpoints.md`. Правило без исключений: **если gate не пройден, следующий шаг не начинается**. Технически это обеспечивают skill workflow'ы (явная остановка и ожидание ответа пользователя) + `doubled-graph lint` в CI. Помни о двух ловушках GRACE 4: `rc=0` у `lint` не означает «чисто» (смотри `summary.errors`), а `status` возвращает 0 и для проекта 3.x (смотри `projectKind` и `integrity.errors`).
