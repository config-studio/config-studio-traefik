# 06 — Generate

**Роль ИИ:** выполнить задачи `T-###` активного бандла `.grace/changes/active/C-001-INITIAL-BUILD/plan.xml`, генерируя код по фазам — с разметкой, logs, тестами.

---

## Выбор оркестрации

**Одиночный агент (sequential):**
- 1–3 модуля в плане,
- у IDE нет инструмента sub-agents (проверка: вызови tool `task`/`subagent`; ошибка «tool not found» → режим sequential),
- пользователь явно выбрал sequential в первом сообщении.

**Multiagent (parallel waves):**
- есть многомодульные фазы (> 2 параллельных модулей),
- IDE поддерживает sub-agents (Claude Code, Cursor background agents).
- Координация волны — задачи `T-###` из `.grace/changes/active/C-001-INITIAL-BUILD/plan.xml`: каждая задача `T-###` описывает `Title`, `DependsOn`, `AcceptanceCriteria`, `Verification`. Пакетов `ExecutionPacket`/`GraphDelta`/`FailurePacket` в GRACE 4 нет — их роль выполняют `spec.xml` + `plan.xml` активного бандла.

При multiagent выбери **профиль автономии** (`safe` / `balanced` / `fast`) по таблице:

| Ситуация | Профиль |
|---|---|
| первый день на методологии + новый код | `safe` |
| стандартный старт проекта | `balanced` (default) |
| mature codebase + strong verification (редко для new-project) | `fast` |

(Глубина артефактов в doubled-graph не масштабируется, всегда максимум; см. `methodology/auto-scaling.md`.)

**Approval gate (план исполнения):**

Покажи:

1. Предложенный выбор с однострочным объяснением:
   - `single` — sequential, approval перед execute очереди;
   - `multiagent: safe` — параллельно, **approval перед каждой волной**;
   - `multiagent: balanced` (default) — параллельно, **один approval up-front**, per-module review;
   - `multiagent: fast` — **approval только один раз на весь run**, без per-wave gates (для mature codebase с полным verification).
2. План исполнения: задачи `T-###` → модули → зависимости.
3. **⚠ Особое внимание**: критические модули; модули с `impact` HIGH/CRITICAL; при `fast` — список verification-активов, покрывающих риск.
4. **Чек-лист**:
   - [ ] профиль соответствует зрелости проекта;
   - [ ] для `fast` — verification покрывает критические пути;
   - [ ] порядок исполнения не нарушает `DependsOn` между `T-###`;
   - [ ] risk-level каждого шага < CRITICAL или явно принят.
5. Вопрос:

   > Выбор оркестрации: <профиль>. Подтвердите по чек-листу. Для `fast` — отдельная фраза: «да, fast, понимаю что per-wave approval не будет».

**Особый случай `fast`:** на «да»/«ок» переспроси явно — «`fast` отключает per-wave approval. Подтвердите отдельной фразой.» Не начинай execute на `fast` без явной фразы.

---

## Выполнение задачи `T-NNN`

**Для каждой задачи** из `ImplementationPlan` активного бандла:

**Шаг 1** — выбор модулей задачи. Показываешь пользователю, какие `M-*` будут сделаны в этой волне.

**Шаг 2** — регистрация модуля в графе (если якорь ещё не объявлен).

Правь `.grace/graph/main.xml` и `.grace/graph/index.xml` одним коммитом:

```xml
<M-AUTH-VALIDATE>
  <Name>Auth validate</Name>
  <Status>existing</Status>
  <Summary>Валидирует входящий JWT и возвращает пользователя. Обслуживает цель 1.</Summary>
  <Path>src/auth/validate.py</Path>
  <Depends>
    <M-AUTH-TOKENS />
  </Depends>
</M-AUTH-VALIDATE>
```

- Новый `M-*` — новый тег-ребёнок `GD-MAIN` + строка `<M-AUTH-VALIDATE />` в `<Owns>` индекса. Пропущенный `Owns` — ошибка `projection.graph.unlisted-anchor`.
- `V-<M-id>` должен существовать (создан на шаге 05); иначе `projection.verification.missing-module-coverage`.

**Шаг 3** — worker(s) генерируют код. Каждый worker:

1. `doubled-graph module show M-AUTH-VALIDATE --repo .` — получает запись модуля (Summary, Path, Depends, локальные файлы).
2. `doubled-graph context <symbol> --repo .` — 360-view на ключевой символ модуля (computed + declared + source), когда нужен обзор связей.
3. Читает `.grace/graph/main.xml` — Summary своего `M-*` и зависимости.
4. Читает `.grace/context/technology.xml` — использует указанные библиотеки.
5. Читает `methodology/language-adapters/<язык>.md` — учитывает language-specific правила.
6. Пишет файл с разметкой:

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

Правила разметки (жёсткие, их проверяет `grace lint`):
- `MODULE_CONTRACT` обязателен; `PURPOSE`, `SCOPE`, `DEPENDS`, `LINKS` обязательны и всегда UPPERCASE-ключами.
- `LINKS` содержит `M-*` — это **единственная** связь файла с модулем. Значения `UC-*`, `V-M-*` и любые другие игнорируются движком; файл без `M-*` в `LINKS` не прикрепляется ни к одному модулю.
- `ROLE` ↔ `MAP_MODE` строго парой: `RUNTIME`→`EXPORTS`, `TEST`→`LOCALS`, `BARREL`→`SUMMARY`, `CONFIG`→`NONE`, `TYPES`→`EXPORTS`, `SCRIPT`→`LOCALS`.
- `MODULE_MAP` — строки вида `symbol - описание` (дефис с пробелами, не `(тип)`).
- `CONTRACT:fn` блоки — на каждую публичную функцию; `BLOCK_*` — для секций > 20–30 строк.
- `CHANGE_SUMMARY`/`LAST_CHANGE` не обязательны, но если секция есть — `LAST_CHANGE` внутри обязателен.
- Structured logs: поля `anchor`, `module`, `marker` (без `requirement`/`UC-*`).

Пример конца файла, если ведёшь историю изменений:

```
# START_CHANGE_SUMMARY
# LAST_CHANGE: 2026-04-18 — создан модуль валидации (DG-Authored: ai)
# END_CHANGE_SUMMARY
```

**Шаг 4** — реализация тестов. Для каждой `V-<M-id>` из `.grace/verification/main.xml`:

- тестовый файл по пути из `<TestFiles><File>…</File></TestFiles>` (файл должен существовать — иначе `verification.test-file-missing`);
- тест запускается командой из `<Command>` с `<Cwd>`;
- покрывает сценарии из `<Scenario>`;
- порождает log-событие с `<Marker>`.

**Шаг 5** — worker после кодогенерации:

```bash
doubled-graph analyze --mode incremental --paths <новые-файлы> --repo .
```

Возвращает обновлённый computed graph: новые/изменённые файлы, символы, связи.

**Шаг 6** — reviewer (в `safe`/`balanced`):

```bash
doubled-graph lint --path .
doubled-graph detect-changes --scope staged --repo .
```

- проверяет соответствие контракту из `<Summary>`/`CONTRACT:*`;
- проверяет наличие разметки (нет — `markup_missing`);
- запускает `<Command>` из `V-M-*`;
- для `critical` — проверяет, что `<Marker>` реально попадает в лог.

**Шаг 7** — после волны:

1. `doubled-graph analyze --mode incremental --paths <файлы> --repo .`
2. Задачи `T-###` в `.grace/changes/active/C-001-INITIAL-BUILD/plan.xml` не имеют поля статуса — прогресс фиксируется через `<ObservedWriteScope>` (шаг 7.3) и `status` самого бандла. Выполненные задачи не удаляй: `ImplementationPlan` — история прогона.
3. Допиши фактически изменённые пути в `<ObservedWriteScope>` того же `plan.xml`:

```xml
<ObservedWriteScope>
  <Path>src/auth/validate.py</Path>
  <Path>tests/auth/test_validate.py</Path>
  <Path>.grace/graph/main.xml</Path>
</ObservedWriteScope>
```

4. Если реальность разошлась с планом — правь `.grace/graph/main.xml` (`<Summary>`, `<Path>`, `<Depends>`) и `V-M-*`, а не `docs/*.xml` (их в GRACE 4 нет). См. skill `doubled-graph-after-edit` шаг 2.

---

## Правила качества кода

- **Следуй `.grace/context/technology.xml`.** Не добавляй библиотеки, которых там нет, без возврата на approval.
- **Следуй `methodology/language-adapters/<язык>.md`.** Язык-специфичные правила важнее общих.
- **Pre/post/invariants** — как runtime-проверки **только** для `critical`/`standard` модулей и только по рекомендации language-adapter'а.
- **Logs на русском или английском** — последовательно в рамках проекта (обычно английский для машиночитаемости полей).
- **Не смешивай языки в одной строке лога.** «event: 'user_login', msg: 'пользователь вошёл'» — ок; «event: 'пользователь_вошёл'» — нет (ломает downstream).
- **Не трогай `docs/`.** Legacy-документы GRACE 3, если они есть, — только чтение; перенос/архивация — отдельное решение пользователя.

---

## Approval между фазами

**Профиль `safe`:** approval перед каждой задачей `T-###` (вы уже выбрали это).
**Профиль `balanced`:** approval был один раз up-front. Между задачами — только если были явные блокеры.
**Профиль `fast`:** без approval, только в конце задачи — scoped reviewer.

---

## Переход

После завершения всех задач `T-###` — прочитай `prompts/new-project/07-post-init-sync.md` через Read tool и следуй его инструкциям.
