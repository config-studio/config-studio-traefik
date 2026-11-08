# doubled-graph — обзор и навигация

doubled-graph держит **два графа кода**:

- **computed graph** — то, что AST-парсер (CodeGraphContext) реально находит в коде;
- **declared graph** — то, что зафиксировано в `.grace/`: `context/*.xml`, `graph/{index,main}.xml`, `verification/{index,main}.xml`, `changes/{active,archive}/`.

Расхождение графов — **дрейф**. Цель методологии — нулевой дрейф между кодом и `.grace`.

## MCP-инструменты

Сервер `doubled-graph` зарегистрирован в IDE: операции через MCP, не через Bash — быстрее (без subprocess), типизированный JSON.

| Tool | Когда вызывать |
|---|---|
| `analyze` | построить/обновить computed graph (`mode="full"` или `mode="incremental"`) |
| `impact` | **до** правки символа — blast radius, affected modules, risk level |
| `context` | 360° view: символ + контракт + входящие/исходящие вызовы |
| `detect_changes` | **до** коммита — дрейф между кодом и `.grace` |
| `health` | отчёт: `artifacts` (`project_kind`, `deprecated`, `issues`), модули без `V-M-*`, drift count, открытые `DRIFT.md` |
| `migrate_check` | read-only инвентарь миграции 3.x → 4.x (ничего не пишет) |
| `lint` | `grace lint --path . --format json`: якоря, `Owns`-маршруты, покрытие `M-* → V-M-*` |
| `module_show` / `module_find` | прочитать / найти `M-*` |
| `file_show` | `MODULE_CONTRACT` / `CONTRACT:fn` / `BLOCK_*` без чтения всего файла |

**Soft-failure:** lint findings, «модуль не найден», «файл без якорей» — не ошибки (`ok:false` / `found:false` со структурными деталями). Реальный сбой приходит как `{"error": "GRACE_CLI_ERROR", "detail": "rc=… "}`.

## CLI движка (`grace`, pinned `@osovv/grace-cli` 4.x)

| Команда | Назначение |
|---|---|
| `grace lint --path . --format json` | валидация `.grace` + разметки; exit зависит от `--fail-on` (default `errors`), флагов `--json` / `--verbose` нет |
| `grace status --path . --json` | `projectKind`, `integrity`, `changes`, `derivedStates`, `nextAction`; rc=0 даже для 3.x — смотри `projectKind` |
| `grace module show` / `find` / `health` | запись модуля, поиск, autonomy-readiness |
| `grace verification show` / `find` | запись `V-M-*`, поиск по verification (через `doubled-graph verify` и `module health` — см. CLI ниже) |
| `grace file show` | якоря одного файла |

## CLI doubled-graph (2.0)

`setup`; `migrate check|apply [--dry-run] [--no-markup-fix]`; `lint`; `module show|find|health`; `verify`; `file show`; `health`; `status` (`artifacts.project_kind`, `grace_engine`); `analyze`; `impact`; `context`; `detect-changes`; `phase get|set`; `init-hooks`; `kill-server`.

## Семейство skills

| Skill | Когда |
|---|---|
| `doubled-graph-before-edit` | до любой правки кода — impact-gate |
| `doubled-graph-after-edit` | после правки, до коммита — `C-*` / drift / lint / verification / contract |
| `doubled-graph-drift` | `detect_changes` вернул непустой drift |
| `doubled-graph-manual-edit` | человек поправил код вручную, без ИИ |
| `doubled-graph-refactor` | rename/move/split/extract — код + `.grace` + `V-M-*` |
| `doubled-graph-verify` | у модуля нет `V-<M-id>` |

Workflow'ы — markdown в системном промпте, не tool calls.

## Режим методологии

`AGENTS.md`, блок `<!-- doubled-graph:phase:start -->`:

- **`migration`** — код = ground-truth, `.grace` догоняет; каждое изменение оформляется бандлом `.grace/changes/active/C-*`.
- **`post_migration`** — артефакты = ground-truth; контракт нельзя нарушать без `C-*` spec с `approved`. Default, если `AGENTS.md` нет.

## Базовый цикл

```
намерение править X -> before-edit (impact + risk-gate) -> правка
-> after-edit (C-*, drift, lint, V-M-*, contract gate) -> commit
drift -> drift; правил человек -> manual-edit;
rename/move -> refactor; нет V-<M-id> -> verify
```

## Артефакты в одну строку

`.grace/context/*` — 5 обязательных файлов (`requirements`, `technology`, `principles`, `deployment`, `ux-guidelines`, `graceVersion="4.0"`); `graph/index.xml` маршрутизирует `GD-*` → `<Path>` + `<Owns>`, якоря `M-*`/`DF-*` — в `graph/main.xml`; `V-M-*` — в `verification/main.xml`, у каждого `M-*` обязан быть `V-<M-id>`; изменения — `changes/active/C-*/{spec,plan}`, архив — `applied`/`rejected`/`cancelled`/`superseded`. Якоря — теги без атрибутов, остальные теги PascalCase.

## Если что-то не работает

- **MCP не отвечает**: проверь `.mcp.json`; `doubled-graph setup` пересоздаёт регистрацию.
- **MCP недоступен**: CLI-форма того же кода — `doubled-graph impact <symbol> --direction upstream`, `analyze --mode incremental --paths X`.
- **`grace` не установлен**: `doubled-graph setup` ставит pinned 4.x (Bun, при его отсутствии — tsx).
- **`project.grace3-detected` / `invalid-project`**: `doubled-graph migrate check` → `migrate apply`. Без миграции `impact`/`context`/`detect_changes` читают legacy `docs/*.xml` deprecated-парсером, `setup` бутстрапит пустой `.grace`, если артефактов нет вовсе.
