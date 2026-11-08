# Новый проект — вход

**Скопируй этот текст в свой ИИ-ассистент** (Claude Code, Cursor, Continue, …) как первое сообщение после открытия пустого репозитория.


## Что произойдёт дальше

ИИ должен прочитать `prompts/new-project/01-intent-interview.md` и задать вопросы.

## Если у тебя нет пустого репозитория

Используй `prompts/migrate-existing-project/00-entry-prompt.md` вместо этого.

## Если ИИ в IDE без tools+MCP

Методология не работает без MCP и tools — см. `methodology/README.md § Предусловия`. Подключи MCP (в IDE-adapter из `methodology/runtime-adapters/`) или смени IDE.


---

# Промт


```
Я начинаю новый проект по методологии doubled-graph (GRACE 4, артефакты в `.grace/`).

Твоя задача — провести меня через полный цикл от бизнес-идеи до работающего MVP с артефактами `.grace/`, разметкой кода, тестами, hooks.

Последовательность шагов — ровно такая:
1. Intent-интервью (prompts/new-project/01-intent-interview.md).
2. Bootstrap артефактов (prompts/new-project/02-requirements.md): через mkdir + Write создай `.grace`-скелет:
   - `.grace/context/{requirements,technology,principles,deployment,ux-guidelines}.xml` (все 5 обязательны, каждый с `graceVersion="4.0"`);
   - `.grace/graph/index.xml` + `.grace/graph/main.xml`;
   - `.grace/verification/index.xml` + `.grace/verification/main.xml`;
   - `.grace/changes/active/` + `.grace/changes/archive/`.
   Плюс `AGENTS.md` с phase-блоком `post_migration`. Никаких `docs/*.xml` не создавай — в GRACE 4 их нет.
   Глубина артефактов — всегда максимальная, никаких lite-вариантов (methodology/auto-scaling.md).
3. Technology (03-technology.md) — `.grace/context/technology.xml` и `.grace/context/deployment.xml`, ДО плана модулей.
4. Development plan (04-development-plan.md) — модули `M-*` в `.grace/graph/main.xml` + `Owns` в `.grace/graph/index.xml`, плюс активный бандл `.grace/changes/active/C-001-INITIAL-BUILD/` (`spec.xml` + `plan.xml` с задачами `T-###`). Approval gate обязателен.
5. Verification plan (05-verification-plan.md) — `V-<M-*>` в `.grace/verification/main.xml` + `Owns` в `.grace/verification/index.xml`.
6. Генерация кода по задачам `T-###` (06-generate.md). Каждую фазу подтверждаем отдельно.
7. Первый полный analyze: `doubled-graph analyze --mode full --force --repo .`.
8. Установка hooks (07-post-init-sync.md) и закрытие бандла `C-001-INITIAL-BUILD` в `.grace/changes/archive/`.

Правила:
- Все approval-gates — явные. Не иди дальше без моего подтверждения.
- Перед любой правкой уже созданного файла — активируй skill `doubled-graph-before-edit` (или fallback: prompts/maintenance/on-before-edit.md).
- В конце каждой фазы кодогенерации — skill `doubled-graph-after-edit` (или prompts/maintenance/on-after-edit.md).
- Единая точка входа — CLI `doubled-graph`: `setup`, `status`, `analyze`, `impact`, `context`, `detect-changes`, `lint`, `verify`, `module show|find|health`, `file show`, `health`, `init-hooks`, `phase get|set`. Прямой вызов движка — `grace lint --path . --format json` (флагов `--json` / `--verbose` у `grace lint` в 4.x нет).
- Всё остальное (создание/правка `.grace/*.xml`, `AGENTS.md`) — через стандартные Read/Edit/Write.
- **Каждый шаг начинается с явного чтения соответствующего файла промпта через Read tool.** Не угадывай содержимое — читай файл и следуй его инструкциям точно.

Если что-то из этого неясно или отсутствует — скажи сейчас, прежде чем начать.

Начнём с шага 1 — прочитай `prompts/new-project/01-intent-interview.md` и следуй его инструкциям.
```
