# Approval checkpoints

Ключевой принцип 2: **каждый артефакт утверждается человеком перед тем, как стать входом для следующего шага**.

**Правило без исключений:** если gate не пройден, следующий шаг не начинается. Технически это обеспечивают workflow'ы skills семейства `doubled-graph-*` (явная остановка в скиле и ожидание ответа пользователя), `doubled-graph.lint()` в CI и `doubled-graph.detect_changes()` как pre-commit/pre-merge gate.

---

## 1. Workflow gates

Точки остановки в наших skills и in-flow workflow (`prompts/new-project/`, `prompts/migrate-existing-project/`, `prompts/maintenance/`).

### Bootstrap артефактов (новый проект / миграция)
**Нет явного approval.** Создание скелета `.grace/` (`context/`, `graph/`, `verification/`, `changes/active`, `changes/archive`) и `AGENTS.md` через `Write` (либо `doubled-graph setup`, который сам выбирает migrate или bootstrap). Дополнительный review можно сделать руками (посмотреть, что создано) — не обязательно.

Шаблоны — inline в `prompts/new-project/` и `methodology/artifacts.md`.

### Архитектура модулей — approval-gate
После того как агент задрафтил записи `<M-*>` в `.grace/graph/main.xml` (через `Edit`), останавливается и показывает пользователю список.

**Что показывается:** список модулей с contract draft'ами (`Name`, `Status`, `Summary`, `Path`, `Depends`).

**Критерий одобрения:**
- модули покрывают требования из `.grace/context/requirements.xml` (требования — свободный текст, якорей `UC-*` в 4.x нет);
- у каждого `M-*` заполнены `Summary` и `Path`; `Depends` ссылается только на существующие `M-*`/`DF-*`;
- класс критичности модуля согласован — от него зависит `<Priority>` его `V-<M-id>`;
- нет модулей, у которых scope не ясен.

Пользователь либо апрувит — workflow продолжается на verification draft, либо правит список — агент `Edit`-ит `.grace/graph/main.xml` и снова показывает.

### Verification draft — approval-gate
Агент по подтверждённым модулям драфтит записи `<V-M-*>` в `.grace/verification/main.xml` (через `Edit`).

**Что показывается:** список записей `V-M-*` с `<Priority>`, `<Cwd>`, `<TestFiles>`, `<Command>`, `<Scenario>`, `<Marker>`, `<TraceAssertion>`.

**Критерий:**
- каждый `M-*` имеет `V-<M-id>` — это hard-gate `grace lint` (`projection.verification.missing-module-coverage`);
- `<Command>` и хотя бы один `<Scenario>` заполнены: пустая заглушка помечается `verification.placeholder` и видна в `grace module health`, покрытием она не считается;
- для критических модулей — минимум один `integration`-тест (не только unit).

### План исполнения — approval-gate
Агент драфтит бандл изменения `.grace/changes/active/C-*/`: `spec.xml` (что меняется, зачем, какие `M-*` затронуты) + `plan.xml` (фазы, шаги, порядок, критерии приёмки). Статус бандла — `draft`; после одобрения — `approved`; после применения бандл уезжает в `.grace/changes/archive/` со статусом `applied` (`rejected` / `cancelled` / `superseded` — если не поехал).

**Что показывается:** фазы → шаги → модули с порядком исполнения, estimated impact, зависимости.

**Критерий:**
- порядок исполнения не нарушает зависимости (`Depends` в `.grace/graph/main.xml`);
- разбивка на шаги адекватна (не слишком крупные шаги, которые могут сорвать);
- risk-level (через `doubled-graph.impact()`) для каждого затронутого символа < CRITICAL, либо явно принят.

### Contract-change — approval-gate (in-flow, маленькие)
Каждое изменение публичной сигнатуры / pre/post / invariant модуля — отдельный gate в skill `doubled-graph-after-edit` шаг 6. Агент показывает diff контракта, ждёт явного «contract change ок» / «откати».

### Изменение артефактов — бандл `C-*`, а не правка «на месте»
Любая правка `.grace/**` (новый `M-*`, новый `V-<M-id>`, смена `Depends`, новый контекст-артефакт) оформляется бандлом `.grace/changes/active/C-*/` (spec + plan). Бандл и есть носитель approval: `draft` без подписи человека не применяется. Прямой `Edit` артефактов остаётся только в режиме `migration`, где смысл обратный — привести артефакты в соответствие с уже существующим кодом.

---

## 2. doubled-graph-собственные gates (инфраструктурные)

### Phase-switch gate
Переключение `migration` → `post_migration` и обратно через `doubled-graph phase set`. Всегда требует человеческого подтверждения. Параметры:

- переход в `post_migration` — проверяется, что `doubled-graph.lint()` + `doubled-graph.detect_changes(scope="all")` оба возвращают чистый результат;
- откат → `migration` — обязательна запись в `docs/DRIFT.md` с причиной и ожидаемым окончанием.

### Pre-commit gate (рекомендован, опционален локально, обязателен в CI)

```bash
# doubled-graph lint — это gateway над `grace lint --path . --format json`
doubled-graph lint \
  && doubled-graph detect-changes --scope staged \
  && доступные unit-тесты
```

Если `detect-changes` непуст и drift не задокументирован в `DRIFT.md` — merge блокируется.

### Pre-merge gate (обязателен)

Перечень обязательных проверок фиксируется в CI-workflow и в `<Command>` записей `V-M-*` в `.grace/verification/main.xml`. Отдельного тега `<Gate>` в GRACE 4 нет — gate это набор команд CI плюс verification-записи, на которые он опирается:

```bash
grace lint --path . --format json                                  # rc=0 ≠ «чисто»: смотри summary.errors
doubled-graph detect-changes --scope compare --base-ref main
pnpm test
```

---

## 3. Eval gates (обязательны при наличии critical-модулей)

Eval-gate добавляется, если хотя бы один модуль помечен как critical (`<Priority>high</Priority>` у его `V-<M-id>`). Отдельного XML-тега под eval в `.grace` нет: сам gate живёт в CI-workflow, а его данные — в репозитории (`datasets/`) и в `<Scenario>`/`<TraceAssertion>`/`<TestFiles>` записей `V-M-*`.

```yaml
# .github/workflows/eval.yml
- name: prompt-quality
  run: pnpm eval --dataset datasets/golden-cases.jsonl --judge structured-rubric --min-pass-rate 0.85
```

**Что проверяется:**
- `prompt-quality` — соответствие сгенерированного кода контракту на golden-датасете.
- `ai-regression` — прогон сохранённых сценариев, сравнение с baseline.

**LLM-as-Judge bias**: используем swap-and-compare + diverse judge (модель-судья отличается от модели-генератора).

**Важно:** eval-gates **не заменяют** unit/integration тесты (принцип 9). Это дополнительный слой для агентного поведения.

---

## 4. Drift-resolution gates (post_migration)

В `post_migration` каждый item drift'а — отдельный gate. Агент НЕ применяет автоматическую резолюцию: просит у пользователя выбор «new requirement / bug / defer» (см. skill `doubled-graph-drift` § B). «Не знаю» → запись в `docs/DRIFT.md`, модуль блокируется для ИИ-правок до решения.

В `migration` drift-resolution автоматическая (см. skill `doubled-graph-drift` § A) — артефакты обновляются под код через `Edit`, ревьюется только итоговый `git diff .grace/`.

---

## 5. Таблица gates vs сценарии

| Сценарий / шаг | gate |
|---|---|
| Новый проект, intent-интервью | — (сбор данных, не gate) |
| Новый проект, bootstrap `.grace/` | — |
| Новый проект, архитектура модулей | **approval-gate** |
| Новый проект, verification draft | **approval-gate** |
| Новый проект, план исполнения | **approval-gate** |
| Миграция, requirements recovery | **approval-gate** (утверждаем восстановленные требования) |
| Миграция, план | **approval-gate** (архитектура) |
| Миграция, переход в `post_migration` | **phase-switch gate** |
| Поддержка, любая правка | `impact` HIGH/CRITICAL → **approval перед правкой** |
| Поддержка, contract-change | **approval-gate** (skill `doubled-graph-after-edit` шаг 6) |
| Поддержка, любая правка `.grace/**` | **approval-gate** (бандл `C-*`: `draft` → `approved`) |
| Поддержка, drift в post_migration | **approval per item** (skill `doubled-graph-drift` § B) |
| Поддержка, перед коммитом | **pre-commit gate** (рекомендован) |
| Перед merge в main | **pre-merge gate** (обязателен) |

---

## 6. Что делать при провале gate'а

Зависит от типа провала:

- **approval отказан** → вернуться на один шаг назад, переделать артефакт.
- **`grace lint` отдаёт `project.grace3-detected`** → проект ещё на GRACE 3: `doubled-graph migrate check`, затем `doubled-graph migrate apply` (legacy-доки не удаляются, `LINKS: M-*` чинятся автоматически).
- **`doubled-graph.lint()` не проходит** → фикс разметки якорей, чаще всего простой (см. response shape в skill `doubled-graph-after-edit` шаг 4).
- **`doubled-graph.detect_changes()` показывает drift** → применить skill `doubled-graph-drift`.
- **тесты не проходят** → стандартный debug-флоу. Skill `doubled-graph-before-edit` для понимания blast radius перед фиксом.
- **eval-gate показывает регрессию** → скорее всего изменился промпт или модель; откатываем промпт/модель или добавляем новые golden cases.

**Что не делаем:** никогда не обходим gate через `--no-verify` или эквивалент. Если gate мешает — чиним его, а не отключаем.
