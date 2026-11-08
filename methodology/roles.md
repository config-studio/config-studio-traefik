# Роли: кто что делает

doubled-graph — методология **управляемой автономии** (принцип 10). Ниже — кто отвечает за что, где границы.

---

## Человек — архитектор и верификатор

### Единоличная ответственность

1. **Формулировка замысла.** Первичные бизнес-требования, приоритеты, non-functional constraints.
2. **Утверждение артефактов** на approval-gates (см. `approval-checkpoints.md`). Без подписи человека артефакт не становится входом для следующего шага.
3. **Принятие решения по drift.** В режиме `post_migration` только человек отвечает «новое требование» / «баг» / «не знаю».
4. **Переключение режима** `migration` ↔ `post_migration`. Инструмент не решает это автоматически.
5. **Выбор профиля автономии** (`safe` / `balanced` / `fast`) при параллельной кодогенерации, см. `prompts/new-project/06-generate.md`.
6. **Приёмка merge**. Ни один PR не сливается автоматически, даже если все gate-ы зелёные.
7. **Решение, когда отключить ИИ** на конкретный участок кода (security-sensitive, custom invariants, секреты).

### Разделяемая с ИИ

- Ревью diff'а. ИИ подсвечивает риск (через `impact` risk-level), человек решает.
- Разбор инцидентов в production. ИИ помогает навигацией (graph, logs с `belief`), человек принимает решения.
- Решение о `criticality` модулей. ИИ предлагает по эвристике, человек фиксирует.

---

## ИИ-ассистент — исполнитель в рамках каркаса

### Что делает

1. **Заполняет артефакты по шаблонам.** При bootstrap'е — `Write` скелета `.grace/` (`context/`, `graph/`, `verification/`, `changes/`) и `AGENTS.md` по сценарию из `prompts/new-project/`. При поддержке — правка артефактов через бандл `C-*` (см. skill `doubled-graph-after-edit`).
2. **Генерирует код** по утверждённому плану — `plan.xml` активного бандла `C-*` и записям `M-*` в `.grace/graph/main.xml`, с якорями и контрактами.
3. **Пишет тесты** по шаблонам записей `V-M-*` в `.grace/verification/main.xml` (skill `doubled-graph-verify`).
4. **Структурированное логирование** с `anchor`, `belief`, `correlation_id`.
5. **Impact-анализ** перед правками (через `doubled-graph.impact()`, skill `doubled-graph-before-edit`).
6. **Синхронизация `.grace/**`** под код: в режиме `migration` — без вопросов, в `post_migration` — только через утверждённый бандл `C-*` (`spec.xml` + `plan.xml`).
7. **Откат кода под контракт** через `Edit` (в режиме `post_migration`, см. skill `doubled-graph-drift` § B.3).
8. **Предложения по архитектуре** — но не утверждение.

### Что НЕ делает

1. **Не утверждает собственные артефакты.** Gate-ы — за человеком.
2. **Не меняет phase в `AGENTS.md`.** Может подсветить кандидатуру на переключение, менять — только человек.
3. **Не игнорирует HIGH/CRITICAL risk без явного разрешения.** Правило из CLAUDE.md: «MUST warn the user if impact analysis returns HIGH or CRITICAL risk before proceeding with edits.»
4. **Не удаляет `docs/DRIFT.md` записи.** Только закрывает их (статус → resolved) после согласованного фикса.
5. **Не пушит и не мёрджит.** PR создаёт, кнопку нажимает человек.
6. **Не трогает секреты.** При обнаружении — сигнал человеку, в логи ничего не пишет.

---

## Инструменты — автоматика без решений

Инструменты **выполняют** правила, **не принимают** решения.

### `doubled-graph.lint()` / `doubled-graph lint` (CLI)
Обёртка над `grace lint --path . --format json`. Проверяет парность якорей, уникальность блоков в файле, обязательные поля `MODULE_CONTRACT` (`PURPOSE`/`SCOPE`/`DEPENDS`/`LINKS` с `M-*`), согласованность `ROLE`/`MAP_MODE` и покрытие `M-*` → `V-<M-id>`. Возвращает `{ok, violations[], exit_code}`; CLI exit 1 если `ok: false` (для CI-gate). Помни: при дефолтном `--fail-on errors` код 0 ещё не значит «чисто» — смотри `summary.errors` в JSON.

### MCP-tools `doubled-graph.*`
- `analyze` — пересчитывает computed graph. Авто-действие после `git commit` через `post-commit` hook + Claude Code PostToolUse.
- `impact` — возвращает risk-level. **Не блокирует правку сам по себе** — только выводит предупреждение; решение за агентом/человеком.
- `context` — справочник. Не меняет состояние.
- `detect_changes` — возвращает drift. Блокирует только в pre-commit/pre-merge gate, где явно настроено.
- `health` — combo metrics для CI: drift count, модули без `V-<M-id>`, open `DRIFT.md` entries. Поштучно, по модулю — `grace module health <M-*>` (готовность модуля к автономной работе).

### Hooks
- `post-commit` — запускает `analyze`. Background, не влияет на git-flow.
- Claude Code `PostToolUse` — тот же `analyze`, но чаще. Сокращает stale-окно.
- `prepare-commit-msg` (опц.) — добавляет `DG-Authored:` trailer. Никогда не блокирует.

---

## Multiagent orchestration

При параллельной кодогенерации (опционально, для крупных проектов):

| Роль | Кто |
|---|---|
| **Controller** | ИИ-агент (основная сессия), ведёт план, диспетчеризует волны |
| **Worker** | ИИ-агент в отдельной sub-session, получает бандл `C-*` (spec + plan) для одного модуля, возвращает отчёт по бандлу (статус `approved` → `applied`, что реально изменено) |
| **Reviewer** | ИИ-агент с ролью review — проверяет отчёт по бандлу, markup, `V-M-*` |
| **Human** | все approval-gates + разрешение конфликтов между worker'ами |

**MCP-tools доступны всем ролям.** Sub-agents наследуют MCP-конфигурацию проекта (`.mcp.json`). Worker вызывает `context()` перед кодогенерацией и `analyze()` после; reviewer — `lint()`, `detect_changes()`, `health()`. Controller диспетчеризует и координирует.

**Правило параллельности:** «только один worker пишет в один модуль за раунд». Пересечение путей — conflict, controller решает (обычно — сериализует).

Conventions для бандлов `C-*` — в `.grace/changes/active/C-*/` целевого репо: `spec.xml` (что и зачем меняется, какие `M-*` затронуты) + `plan.xml` (шаги, порядок, критерии приёмки). Native orchestration tool в doubled-graph не реализован; controller-логика — это часть агентского workflow в `prompts/new-project/06-generate.md`.

---

## Таблица «кто инициирует / кто одобряет / кто исполняет»

| Действие | Инициатор | Одобряет | Исполняет |
|---|---|---|---|
| Новое требование | человек | человек (self) | ИИ правит свободный текст `.grace/context/requirements.xml` |
| Архитектура модулей | ИИ (по требованиям) | **человек (architecture approval-gate)** | ИИ `Edit` записей `<M-*>` в `.grace/graph/main.xml` |
| Стек | ИИ предлагает | **человек** | ИИ закрепляет в `.grace/context/technology.xml` |
| План исполнения | ИИ | **человек (execute approval-gate)** | ИИ оформляет бандл `C-*` (spec + plan) |
| Генерация кода | ИИ | человек через PR review | ИИ |
| Unit-тесты | ИИ (skill `doubled-graph-verify`) | человек через PR review | ИИ |
| Правка функции | ИИ | `impact` risk-level + человек если HIGH/CRITICAL | ИИ |
| Ручная правка | человек | self | человек |
| Drift resolution (post_migration) | инструмент (`detect_changes`) | **человек** | ИИ через `Edit` (skill `doubled-graph-drift` § B) |
| Phase switch | человек | человек (self) | `doubled-graph phase set` + человек коммитит |
| Merge PR | человек | **человек (gate + review)** | git |
| Deploy | человек | человек (вне scope методологии) | CI |

---

## Анти-паттерны ролей

- **«Полностью автономный ИИ».** Методология doubled-graph это отвергает. Zero-approval нарушает принцип 2.
- **«Просто код-ассистент».** ИИ в doubled-graph — не autocomplete. Он отвечает за связность артефактов и логов.
- **«Инструмент, который решает».** `doubled-graph` и hooks — не decision-makers. Они подсвечивают риск и дрейф; решает человек (или ИИ в рамках допустимой автономии).
- **«Архитектор не вовлечён».** Если человек не успевает проходить approval-gates — понижаем профиль (с `balanced` на `safe`), а не отключаем gate-ы.
