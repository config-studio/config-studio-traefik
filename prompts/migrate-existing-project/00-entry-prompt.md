# Миграция существующего проекта — вход

**Скопируй этот текст в свой ИИ-ассистент** как первое сообщение после открытия репозитория с существующим кодом.

## Что произойдёт дальше

ИИ прочитает `01-discover.md`, определит тип проекта командой `doubled-graph status --repo .` (`artifacts.project_kind`), запустит `doubled-graph analyze --mode full --repo .` и соберёт метрики. Ты увидишь саммари.

## Два сценария миграции

Методология работает с двумя состояниями репозитория — ИИ обязан определить, в каком ты, **до** любых правок:

| `artifacts.project_kind` | Что это значит | Что делает ИИ |
|---|---|---|
| `none` | код есть, артефактов нет — ни `.grace/`, ни `docs/*.xml` | ветка **(а)**: bootstrap `.grace`-скелета (`doubled-graph setup`) → восстановление требований и плана |
| `grace3` | код есть + legacy `docs/*.xml` от GRACE 3 | ветка **(б)**: `doubled-graph migrate check` → `doubled-graph migrate apply` → `../upgrade-methodology/01-content-gaps.md` (заполнить пустые `V-<M>` и `MODULE_MAP`) → `doubled-graph lint` |
| `grace4` | `.grace/` уже есть | миграция не нужна: продолжай по `prompts/maintenance/*` |

**Legacy `docs/*.xml` мигратор не удаляет и не переписывает.** Копия переносится в `.grace/`, старые файлы остаются на месте; их архивация — отдельное явное решение пользователя (см. `prompts/migrate-existing-project/06-validation-gates.md`).

## Риски миграции

См. `methodology/workflow.md § Сценарий 2 § Типичные провалы`. Главные:
- попытка разметить всё сразу → идём по кластерам;
- случайные семантические правки под видом разметки → git diff ревью каждого файла;
- «ИИ понял замысел неправильно» → approval на требованиях обязателен;
- «перенёс `.grace` из legacy и забыл заполнить пустые `V-<M>`» → `doubled-graph health` покажет модули без verification, `grace lint` — warning `verification.placeholder`.

## Если ИИ в IDE без tools+MCP

Методология не работает без MCP и tools — см. `methodology/README.md § Предусловия`. Подключи MCP (в IDE-adapter из `methodology/runtime-adapters/`) или смени IDE.


---

# Промт

```
Я буду мигрировать существующий проект на методологию doubled-graph (GRACE 4, артефакты в `.grace/`).

Контекст:
- В репозитории есть код. Артефактов методологии может не быть вообще или в нём лежат legacy-документы GRACE 3 (`docs/requirements.xml`, `docs/technology.xml`, `docs/development-plan.xml`, `docs/knowledge-graph.xml`, `docs/verification-plan.xml`, `docs/operational-packets.xml`). Какой случай твой — определяет `doubled-graph status --repo .` (`artifacts.project_kind`), не догадка.
- Тесты могут быть, могут не быть.
- Документация в лучшем случае — README.
- Инфраструктура: hooks, CI — возможно есть, возможно нет.

Твоя задача — восстановить артефакты `.grace/` под код, постепенно разметить, настроить verification.
Код при этом не должен менять поведение. Любые семантические правки — отдельно после миграции.

Шаг 0 (обязательный): определи тип проекта.
  doubled-graph status --repo .
  Смотри `artifacts.project_kind`: none → ветка (а), grace3 → ветка (б), grace4 → миграция не нужна.

Ветка (а) — артефактов нет:
  doubled-graph setup --repo .
  Создаёт `.grace`-скелет: 5 context-артефактов, graph/{index,main}.xml, verification/{index,main}.xml, changes/{active,archive}.
  Дальше — обычная миграция «снизу вверх»: discover → reconstruct intent → plan → markup → verification.

Ветка (б) — legacy GRACE 3 найден:
  doubled-graph migrate check --repo .     # диагностика: что будет перенесено, что не поддержано
  doubled-graph migrate apply --repo .     # копирование legacy в .grace; legacy НЕ удаляются
  Затем: prompts/upgrade-methodology/01-content-gaps.md — заполнить пустые `V-<M>`
         и `MODULE_MAP` (migrate создаёт заглушки; ИИ заполняет их по коду и тестам)
         → doubled-graph lint --path .
  Авто-фикс `LINKS` в MODULE_CONTRACT мигратор делает сам; `--no-markup-fix` отключает это поведение.

Последовательность (для обеих ветвей):
1. Discover (prompts/migrate-existing-project/01-discover.md) — понять, что есть.
2. Reconstruct intent (02) — восстановить `.grace/context/requirements.xml` из кода + README (+ отчёт миграции, если был).
3. Draft plan (03) — модули `M-*` в `.grace/graph/main.xml` + `Owns` в `.grace/graph/index.xml` поверх существующих модулей.
4. Markup codebase (04) — якоря и контракты, файл за файлом, без изменения логики.
5. Verification and logs (05) — заполнить `.grace/verification/main.xml` (`V-<M-id>`), настроить structured logs.
6. Content gaps (07) — закрыть `map_pending` / `verification.placeholder` / `markup_pending` по коду и тестам (без выдуманных команд).
7. Validation gates (06) — критерии завершения миграции, переключение в post_migration.

Правила миграции (критично):
- В режиме `migration` код = ground-truth, артефакты догоняют.
- Не меняй поведение кода без явного approval. Любая семантическая правка — отдельный коммит ПОСЛЕ миграции.
- Никаких `docs/*.xml` не создавай и не правь. Legacy-документы — только чтение; перенос/архивация — отдельным решением пользователя.
- Каждый шаг — approval gate. Не иди дальше без моего подтверждения.
- **Каждый шаг начинается с явного чтения соответствующего файла промпта через Read tool.** Не угадывай содержимое — читай файл и следуй его инструкциям точно.

Начнём с шага 1 — прочитай `prompts/migrate-existing-project/01-discover.md` и следуй его инструкциям.
```
