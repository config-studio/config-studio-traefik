# Инструменты: лёгкий tool-surface, методология в skills

Методология **не работает** без обоих. Это — precondition, не рекомендация (см. `README.md`).

**Ключевой принцип:** `doubled-graph` — это **9 реальных tool'ов** для работы с дуальным графом плюс CLI-обёртки над `grace` 4.x. Всё остальное — **методологические workflow'ы в SKILL.md**, исполняемые агентом своими `Read`/`Edit`/`Write`/`Bash` tools.

---

## 1. doubled-graph — наш инструмент

- **Автор:** этот репозиторий. MIT.
- **Роль:** дуальный граф + drift detection + обёртки над `grace` CLI (GRACE 4, `.grace`). Не оркестратор методологии — это делают skills.
- **Исходник:** `../docs/SPEC.md`, `../docs/TOOLS.md`, `../docs/HOOKS.md`.

### MCP-tools (всё, что есть)

**Native** (computed × declared graph operations, in-process):

| MCP-tool | CLI | Назначение |
|---|---|---|
| `analyze` | `doubled-graph analyze [--mode ...]` | индексировать/обновить computed graph через CGC |
| `impact` | `doubled-graph impact <target>` | blast-radius перед правкой (mandatory-gate) |
| `context` | `doubled-graph context <name>` | 360-view на символ |
| `detect_changes` | `doubled-graph detect-changes` | drift computed×declared |
| `health` | `doubled-graph health` | health-отчёт: модули без `V-M-*`, drift count, open `DRIFT.md` (для CI) |

**Wrappers** над движком `grace` 4.x (subprocess, прозрачные):

| MCP-tool | CLI | Проксирует в |
|---|---|---|
| `lint` | `doubled-graph lint` | `grace lint` — якоря, `Owns`-маршрутизация, покрытие `M-*` → `V-M-*` |
| `module_show` | `doubled-graph module show <id>` | `grace module show` |
| `module_find` | `doubled-graph module find <q>` | `grace module find` |
| `file_show` | `doubled-graph file show <path>` | `grace file show` — MODULE_CONTRACT / BLOCK_* |

**Это весь публичный MCP-периметр** — 9 tool'ов. Никаких `refresh`/`plan`/`execute`/`fix`/`refactor`/`verification`/`reviewer`/`ask`/`init`/`multiagent_execute` как MCP-tools нет (см. ниже § «Что было удалено»).

### CLI doubled-graph 2.0

| Команда | Назначение |
|---|---|
| `doubled-graph setup` | **единая точка входа:** движок `@osovv/grace-cli` 4.2.1, миграция/бутстрап `.grace`, копирование контента (prompts + methodology), регистрация MCP, hooks, первый `analyze` |
| `doubled-graph migrate check` | read-only инвентарь 3.x → 4.x: что переносится, где дыры в покрытии, какой markup надо починить |
| `doubled-graph migrate apply [--dry-run] [--no-markup-fix]` | записать `.grace` из legacy-документов: копирование, legacy не удаляется, пустые `V-<M>` заглушки, авто-фикс `LINKS: M-*` |
| `doubled-graph lint` | обёртка `grace lint` — валидация `.grace` и разметки кода |
| `doubled-graph module show\|find` | обёртки `grace module show\|find` |
| `doubled-graph file show <path>` | обёртка `grace file show` — MODULE_CONTRACT / CONTRACT:fn / BLOCK_* |
| `doubled-graph verify` | обёртка `grace verification show\|find` — записи `V-M-*` |
| `doubled-graph health` | health-отчёт: модули без `V-M-*`, drift, открытые `DRIFT.md` |
| `doubled-graph status` | диагностика: config + phase + freshness |
| `doubled-graph analyze [--mode full\|incremental\|auto]` | обновить computed graph |
| `doubled-graph impact <target>` | blast-radius |
| `doubled-graph context <name>` | 360-view |
| `doubled-graph detect-changes` | drift computed×declared |
| `doubled-graph phase get` | прочитать текущий phase из `AGENTS.md` |
| `doubled-graph phase set <val> [--reason "..."]` | переключить phase (atomic rewrite `AGENTS.md` phase-блока) |
| `doubled-graph init-hooks [--all]` | git/Claude Code hooks |
| `doubled-graph serve` | старт MCP-сервера на stdio (используется IDE автоматически) |

Часть строк таблицы — те же операции, что и MCP-tools (`lint`, `module_show/find`, `file_show`, `health`, `status`, `analyze`, `impact`, `context`, `detect-changes`): MCP-периметр остаётся девять tool'ов, остальное — для человека, hook'ов и CI.

### Skills (workflows для агента)

`doubled-graph setup` ставит наши SKILL.md в `.claude/skills/`, `.cursor/rules/`, `.continue/rules/`, `.roo/rules/`, `.kilocode/rules/`, `.opencode/rules/`, `.windsurfrules` (per-IDE format). Семейство:

| Skill | Когда |
|---|---|
| `doubled-graph-guide` | overview методологии и навигация |
| `doubled-graph-before-edit` | до любой правки кода — обязательный impact-gate |
| `doubled-graph-after-edit` | после правки, до коммита — drift / lint / tests / contract-check |
| `doubled-graph-drift` | `detect_changes` вернул непустой drift |
| `doubled-graph-manual-edit` | человек поправил код вручную |
| `doubled-graph-refactor` | rename/move/split/extract — координация code + `.grace` + `V-M-*` |
| `doubled-graph-verify` | модуль без `V-M-*` тестов или с пустой заглушкой — добавить покрытие |

### Что НЕ является MCP-tool'ом

11 операций намеренно **не** экспонируются как MCP-tools: `init`, `plan`, `execute`, `multiagent_execute`, `refresh`, `verification`, `reviewer`, `fix`, `ask`, `refactor`. Это **agent-side workflows**, не tools — они исполняются агентом через стандартные `Read`/`Edit`/`Write`/`Bash` под руководством наших SKILL.md, а не как отдельные subprocess-команды.

Где живёт каждая операция:

- **`init` / `plan` / `execute`** — one-off scenarios в `prompts/new-project/` и `prompts/migrate-existing-project/`. Bootstrap `.grace`-артефактов делается агентом через `Write`; planning/execute — итеративные workflow с бандлами `C-*` и approval-gates.
- **`refresh`** — skill `doubled-graph-after-edit` шаг 2 + `doubled-graph-drift` § A. Агент `Edit`-ит `.grace/graph/main.xml` под код.
- **`fix`** — skill `doubled-graph-drift` § B.3. Агент `Edit`-ит код обратно под существующий контракт + запись в `CHANGE_SUMMARY` (опционален) или в бандл `C-*`.
- **`verification`** — skill `doubled-graph-verify`. Workflow заполнения `<V-M-*>` в `.grace/verification/main.xml` + test scaffold пропорционально criticality.
- **`refactor`** — skill `doubled-graph-refactor`. Координация code + `.grace` + `V-M-*` через `impact()` + `Edit`.
- **`reviewer`** — agent через `Read` + сравнение diff (нет dedicated workflow, выполняется в рамках general code review).
- **`ask`** — комбо `context()` + `module_show()` + `Read` для grounded Q&A.
- **`multiagent_execute`** — параллельная кодогенерация через sub-agents (опционально, см. `prompts/new-project/06-generate.md`).

### Почему такое разделение

1. **Честность.** Tool делает работу в-процессе и возвращает результат; skill описывает workflow для агента. Не смешиваем два понятия.
2. **Когнитивная нагрузка.** 9 реальных tools проще, чем 20 (включая 11 которые делают делегирование). Локальные модели среднего размера не путаются.
3. **Расширяемость.** Новые workflow'ы — это новые SKILL.md (markdown, легко аудитировать через git), не код в `tools/*.py`.
4. **Универсальность.** Skills работают во всех 7 IDE (Claude/Cursor/Continue/Roo/Kilo/OpenCode/Windsurf). Native skill API есть только в Claude Code; в остальных skills загружаются как always-on или как named rules — что эквивалентно нашему usage.

---

## 2. grace-marketplace (upstream, не наш)

- **Автор:** osovv. GitHub: `osovv/grace-marketplace`. MIT.
- **Версия** на момент написания методологии: движок `@osovv/grace-cli` **4.2.1** (модель артефактов GRACE 4, `.grace`; сверять актуальность).
- **Что даёт:**
  - skills для Claude Code (агентные процедуры, не CLI).
  - CLI `grace` на Bun — валидация `.grace`, разметки кода и запросы к графу.

**Как мы к ним обращаемся:**
- **CLI `grace`** — агент вызывает через wrapper-tools `doubled-graph.lint`, `doubled-graph.module_show/find`, `doubled-graph.file_show` (см. §1 Wrappers), а `grace verification show|find` — через `doubled-graph verify`. Это даёт единый namespace `doubled-graph.*`, общую точку логирования (`.doubled-graph/logs/`) и возможность enforcement'а policy.
- **Upstream skills** (`grace-init`, `grace-plan`, `grace-execute`, etc.) — **методология их не использует**. Это markdown-инструкции для агента, не CLI. Аналогичные workflow'ы покрываются нашими SKILL.md (`doubled-graph-*` семейство, см. §1) и one-off prompts в `prompts/new-project/` и `prompts/migrate-existing-project/`.

`doubled-graph setup` ставит движок автоматически (через `bun add -g @osovv/grace-cli`, либо через npm/yarn/pnpm + tsx-фолбек если Bun отсутствует).

### CLI GRACE 4 — что важно знать

Поверхность, на которую опираются наши skills и CI:

| Команда | Что делает |
|---|---|
| `grace lint --path . --format json` | валидирует `.grace` и разметку кода; JSON выбирается **только** `--format json` |
| `grace status --path . --json` | состояние проекта: `projectKind`, `integrity`, `changes`, `derivedStates`, `nextAction` |
| `grace module show\|find\|health` | карточка модуля, поиск, health по модулям (включая пустые `V-M-*`) |
| `grace verification show\|find` | записи `V-M-*` и их сценарии |
| `grace file show` | MODULE_CONTRACT / CONTRACT:fn / BLOCK_* одного файла |

Три ловушки, на которых легко соврать себе о состоянии проекта:

1. **Флага `--json` у `lint` нет.** В 4.x JSON-отчёт заказывается `--format json`; неизвестный флаг тихо игнорируется, и вместо JSON приходит человекочитаемый текст. Флага `--verbose` для отчёта тоже нет: `--verbose` в 4.x относится только к `--run-commands` (стриминг вывода прогона).
2. **`exit code` у `lint` зависит от `--fail-on`** (по умолчанию — `errors`). Поэтому `rc=0` ≠ «чисто»: смотри `summary.errors` в JSON.
3. **`status` возвращает exit 0 даже для проекта 3.x.** Проверяй `projectKind` (`grace4`) и `integrity.errors`; по одному коду возврата вывод о проекте делать нельзя.

---

## 3. Проект на GRACE 3.x: что происходит и как лечится

Если в репозитории ещё лежат `docs/*.xml`, а `.grace/` нет, движок 4.x считает проект чужим:

- `grace lint --path . --format json` → error-envelope с кодом **`project.grace3-detected`**, rc=1, записей нет;
- query-команды (`module show`, `verification show`, `file show`) → **`invalid-project`**;
- `grace status --path . --json` → rc=0, но `projectKind` не `grace4`; верить такому «зелёному» статусу нельзя.

**Как лечится.** `doubled-graph migrate check` показывает объём переноса, затем `doubled-graph migrate apply` пишет `.grace` (копирование legacy-модели, пустые `V-<M>` заглушки, авто-фикс `LINKS: M-*`). Legacy-документы при этом не удаляются — их архивация отдельное решение человека. Детали и список ручных шагов — `artifacts.md § Миграция с GRACE 3`.

**Без миграции.** Работать можно только в режиме чтения: `doubled-graph` ещё читает `docs/*.xml` своим legacy-парсером, чтобы `analyze` / `detect_changes` / `impact` не падали. Это **deprecated**-путь:

- движок (`lint`, `module show`, `verification show`, `file show`) недоступен — валидации `.grace` и проверки покрытия `M-*` → `V-M-*` нет;
- новые артефакты писать некуда: бандлы `C-*`, `Owns`-маршрутизация и `graceVersion="4.0"` существуют только в `.grace`;
- legacy-парсер заморожен: он не развивается и будет удалён.

Правило простое: **проект 3.x — это задача миграции, а не режим работы.** Пока миграция не сделана, агент не притворяется, что lint прошёл.

---

## 4. CodeGraphContext — внешняя зависимость, не трогаем

- **Автор:** внешний, MIT.
- **Что используем:** Python-библиотека (`GraphBuilder`, `CodeFinder`, `DatabaseManager`). Импортируется в `src/doubled_graph/integrations/cgc.py`.
- **Что НЕ используем:** MCP-сервер CGC (`cgc mcp start`) — чтобы агент не видел 14 tool'ов.
- **Поддержка 19 языков** (Python, JS, TS, Go, Java, C/C++/C#, Rust, Ruby, PHP, Kotlin, Scala, Swift, Dart, Elixir, Perl, Haskell).
- **Backends:** FalkorDB Lite (Unix default), KùzuDB (Windows/fallback), Neo4j (remote). Выбор автоматический, переопределяется `CGC_RUNTIME_DB_TYPE`.

Известные ограничения CGC:
- Haskell-парсер помечен как unstable в исходнике.
- FalkorDB Lite требует Python 3.12+.
- Windows Neo4j driver 6.x имеет баги — workaround `pip install "neo4j<6"`.

---

## 5. BlackboxBook — источник обоснований, не процесс

Используется как **ссылочный материал**, не как source-of-truth:

- гл. 7 (семантическая разметка) — обоснование для принципа 3.
- гл. 9 (декомпозиция) — обоснование для принципа 1.
- гл. 13 (LDD + антигаллюцинационный контур) — обоснование для принципов 7 и 8.
- гл. 14 (eval-дисциплина) — `approval-checkpoints.md § 4`.
- гл. 17 (OTel GenAI) — **не** применяем как обязательное (см. memory `project_otel_dropped.md`).

Главы 5 и 24 — не используются (спекулятивные места).

---

## 6. GitNexus — почему не используется

GitNexus — граф-анализатор кода, функционально близкий к CGC. На вид — удобнее (больше tools, richer MCP surface). **Лицензия:** PolyForm Noncommercial.

**Решение 2026-04-17:** исключён. PolyForm NC запрещает коммерческое использование; методология, претендующая на публичную публикацию и применимость в enterprise, не может опираться на NC-лицензированные зависимости. Это не техническое решение, а лицензионное.

**Что заменяет:** CodeGraphContext (MIT) + наш `doubled-graph` (MIT). Не даёт всех фич GitNexus (например, embeddings и cluster detection по Leiden), но закрывает базовые потребности методологии.

`doubled-graph` не импортирует ни строки кода из GitNexus. Проверяется commit-time test: `grep -r "gitnexus" src/ | wc -l` == 0.

---

## 7. Взаимодействие инструментов — картина целиком

```
                   ┌─────────────┐
                   │ Пользователь│
                   └──────┬──────┘
                          │
                   IDE (с MCP+tools)
                          │
         ┌────────────────┴────────────────┐
         │                                 │
    [ via skills ]                  [ via MCP ]
         │                                 │
    doubled-graph                   doubled-graph MCP
    skills (inline в IDE)           (9 tools: analyze, impact,
         │                           context, detect_changes,
         │                           lint, module_show/find,
         │                           file_show, health)
         ▼                                 ▼
    CLI `grace` 4.x                 CGC (Python lib)
    (.grace: валидация,             + grace CLI subprocess
    навигация, verification)               │
                                           ▼
                                   .doubled-graph/ logs
                                   CGC DB (FalkorDB/Kùzu/Neo4j)
```

- **doubled-graph skills** — agent-level расширения поведения в IDE.
- **doubled-graph MCP** — все агенты (controller, workers, reviewers) видят 9 tool'ов. Sub-agents наследуют MCP-конфигурацию проекта.
- **grace CLI** — dialected text-UI поверх `.grace`, инструмент для человека и hook'ов; doubled-graph шеллит его для `lint` / `module show` / `file show` / `verification show`.
- **CGC backend** — хранилище computed graph; пользователь обычно не трогает.

---

## 8. Установка одной командой

`for-humans/getting-started.md` (Phase 4) будет содержать финальную команду. Ожидаемая форма (черновик):

```bash
# Python tooling
pipx install doubled-graph

# единая точка входа: движок 4.2.1 + .grace (миграция или бутстрап)
# + контент + MCP + hooks, первым делом
doubled-graph setup --repo .
```

`doubled-graph setup` идемпотентен: повторный запуск обновляет движок, донастраивает MCP и hooks, но не перезаписывает существующий `.grace`. Отдельно для Claude Code — настройка MCP-сервера в `~/.claude/config.json`. Пример — `runtime-adapters/claude-code.md`.
