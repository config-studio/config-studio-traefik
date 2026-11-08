# 05 — Verification and logs

**Роль ИИ:** заполнить `.grace/verification/main.xml` (`V-<M-id>`), привязав существующие тесты, и добавить structured logs (минимально).

---

## Externalize state

Продолжает `.doubled-graph/drafts/plan-draft.md` (из шага 03) и `markup-progress.md` (из шага 04). Добавь секции `V-M-* bindings` и `logs-upgrades-needed` в `plan-draft.md`:

```markdown
## V-<M-id> bindings (step 05)
- V-M-AUTH-VALIDATE → tests/test_auth_validate.py::test_valid_jwt (existing, bound)
- V-M-AUDIT-LOG → pending-to-write (нет теста; DRIFT.md D-TEST-003)
- V-M-PAYMENTS-CHARGE → tests/integration/test_stripe.py (existing)
- V-M-ORDERS-CORE → placeholder из migrate apply, данных нет

## Logs upgrades needed (critical modules only)
- M-AUTH-VALIDATE: добавить anchor, marker [auth][VALIDATE_SUCCESS] в validate_user / BLOCK_DECODE_JWT
- M-PAYMENTS-CHARGE: добавить [payments][PAYMENT_SUCCESS], [payments][PAYMENT_FAIL]

## Privacy audit findings
- src/logging/formatter.py:42 — unmasked email in info log → FIX-NEEDED
- src/auth/jwt.py:78 — raw token in error log → FIX-NEEDED (severe)
```

Финальный рендеринг `.grace/verification/main.xml` — из этих секций. Это важнее, чем в new-project: в legacy-миграции ошибок маскирования PII в логах может быть десятки, легко потерять часть.

---

## Часть A — Verification

**Шаг A.1** — для каждого `M-*` из `.grace/graph/main.xml`:

- найди существующие тесты для этого модуля (эвристика: тесты, которые импортируют/вызывают функции модуля);
- заполни **существующую** запись `V-<M-id>` в `.grace/verification/main.xml` (в ветке (б) заглушку создал `migrate apply`; в ветке (а) запись создаётся тобой).

Канон: **одна** запись `V-<M-id>` на модуль (`M-AUTH` → `V-M-AUTH`). Не создавай `V-M-AUTH-01`, `V-M-AUTH-02` — несколько проверок это несколько `<Scenario>` внутри одной записи.

```xml
<V-M-AUTH-VALIDATE>
  <Priority>high</Priority>
  <Cwd>.</Cwd>
  <TestFiles>
    <File>tests/test_auth_validate.py</File>
  </TestFiles>
  <Command>pytest tests/test_auth_validate.py::test_valid_jwt -v</Command>
  <Scenario>valid JWT возвращает User</Scenario>
  <Scenario>просроченный JWT возвращает null</Scenario>
  <Marker>[auth][VALIDATE_SUCCESS]</Marker>
  <TraceAssertion>лог содержит VALIDATE_SUCCESS и user_id</TraceAssertion>
</V-M-AUTH-VALIDATE>
```

Правила:
- `Priority` из риск-класса шага 03: `critical` → `high`, `standard` → `medium`, `helper` → `low`.
- `TestFiles` — только реально существующие файлы (`verification.test-file-missing` иначе). Пути — относительно корня репозитория.
- `Cwd` — `.`, если тесты запускаются из корня.
- После правок приведи `Owns` в `.grace/verification/index.xml` в точное соответствие с набором записей.

**Шаг A.2** — для `M-*` **без тестов**:

- если critical → **не** запускай разработку тестов в режиме миграции. Оставь запись без `Command`/`TestFiles` (движок пометит её warning'ом `verification.placeholder` — это честное «не проверено») и запиши в `docs/DRIFT.md` блокер завершения миграции: `D-TEST-XXX: M-*** без verification, требует тест до переключения в post_migration`.
- если standard → рекомендуется добавить. Пометь как TODO в самой записи, без ссылок на несуществующие файлы:

  ```xml
  <V-M-ORDERS-CORE>
    <Priority>medium</Priority>
    <Cwd>.</Cwd>
    <Scenario>pending-to-write</Scenario>
  </V-M-ORDERS-CORE>
  ```

- если helper → оставь минимальную запись (`Priority` + `Scenario` «covered by <соседний модуль>»), блокером не считай.

**Шаг A.3 — гейты.**

Элементов `<Gate>` в GRACE 4 нет: гейт — это команда, зафиксированная в `<VerificationIntent>` бандла и в CI.

Если проект уже имеет CI (`.github/workflows/ci.yml`) — не переписывай его, добавь недостающие шаги:

```yaml
- run: doubled-graph lint --path .
- run: doubled-graph analyze --mode full --repo . && doubled-graph detect-changes --scope compare --base-ref main --repo .
- run: pytest            # ← существующий тест-запуск
- run: ruff check .      # ← существующий linter
```

Те же обязательства запиши в `.grace/changes/active/C-001-LEGACY-MARKUP/spec.xml`:

```xml
<VerificationIntent>
  <Intent>Существующие тесты привязаны к V-&lt;M-id&gt;; прогон — команда из V-M-*.</Intent>
  <Intent>Pre-merge гейт: doubled-graph lint --path . + detect-changes --scope compare --base-ref main + pytest.</Intent>
</VerificationIntent>
```

Проверка: `grace lint --path . --format json` → `summary.errors == 0`. Ожидаемые warning'и на этом шаге: `verification.placeholder` для записей без Command (см. A.2) и `verification.test-file-missing`, если путь указан, а файла ещё нет.

---

## Часть B — Structured logs

В легаси проекта часто `print` / не-structured logging. **Миграция НЕ требует** переписывать все логи сразу.

**Минимум миграции** (обязательно):

1. Для **критических** модулей — обновить log-строки в точках, связанных с verification-markers. Один раз, аккуратно.

   Пример: функция `validate_user`, marker `[auth][VALIDATE_SUCCESS]` должен порождаться.

   Было:
   ```python
   logger.info("user validated: %s", user.id)
   ```

   Стало:
   ```python
   logger.info(
       "validate_success",
       extra={
           "anchor": "validate_user:BLOCK_DECODE_JWT",
           "module": "M-AUTH-VALIDATE",
           "marker": "[auth][VALIDATE_SUCCESS]",
           "user_id": user.id,
       }
   )
   ```

   Поля ровно эти: `anchor`, `module`, `marker`. Полей `requirement`/`UC-*` в GRACE 4 нет — трассировка идёт `M-*` → `V-M-*`.

   Это **семантическая правка** (меняет формат лога). Делается **осознанно**, с approval'ом пользователя, отдельным бандлом `.grace/changes/active/C-002-STRUCTURED-LOGS/` (spec.xml + plan.xml по образцу `C-001-LEGACY-MARKUP` из шага 03) и отдельным коммитом:
   ```
   feat(M-AUTH-VALIDATE): structured log with marker
   ```

   В режиме миграции это НЕ запрещено, но должно идти **после** markup-коммита, не смешиваться.

2. Для **standard / helper** модулей — логи оставляем как есть. Пометь в DRIFT.md, что они не структурированные, — это нормально, миграция логов не блокирует переключение phase.

---

## Часть C — Privacy аудит

Прогони grep-поиск по critical-модулям на паттерны:
- hardcoded secrets;
- токены в логах;
- unmasked PII (email, phone, card numbers);
- raw SQL-строки с пользовательским input.

Каждое попадание:
- если маскировка отсутствует — добавь (отдельный коммит, семантическая правка);
- если правка требует архитектурного решения — DRIFT.md.

---

## Переход

После:
- у всех `M-*` есть `V-<M-id>`; допустимы два состояния, и оба проверяются чтением `.grace/verification/main.xml` + `docs/DRIFT.md`: (1) запись заполнена и её `Command` проходит; (2) запись помечена `pending-to-write` и имеет строку в `DRIFT.md`;
- критические модули имеют structured log с markers;
- privacy-аудит пройден.

Если после этого шага часть `V-<M>` осталась пустой (нет тестов / нет команды) — это не повод выдумывать прогон: перейди на `prompts/upgrade-methodology/01-content-gaps.md`, он ведёт по `placeholders` и `markup_pending` и фиксирует решения, требующие пользователя.

→ прочитай `prompts/upgrade-methodology/01-content-gaps.md` через Read tool и следуй его инструкциям, затем `06-validation-gates.md`.
