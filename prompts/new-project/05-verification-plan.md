# 05 — Verification Plan

**Роль ИИ:** заполнить `.grace/verification/main.xml` записями `V-<M-id>` (по одной на модуль) и маршрут `Owns` в `.grace/verification/index.xml`: `Command`, `Cwd`, `Priority`, `TestFiles`, `Scenario`, `Marker`, `TraceAssertion`. Связан со skill `doubled-graph-verify` (тот же подход, но для одного модуля post-launch).

---

## Externalize state

Продолжает `.doubled-graph/drafts/plan.md` (начат в шаге 04). Не создавай новый файл — обогащай существующие секции `V-M-* drafts`, `Gates`, `Eval gates`.

Финальный рендеринг `.grace/verification/main.xml` — **из scratchpad'а**, не из истории. Для каждого `M-*` читай из `plan.md § V-M-* drafts` и формируй запись.

---

## Инструкция

**Шаг 1 — добавь `<Command>` и `<Cwd>` к каждому `V-M-*`.**

На основе `.grace/context/technology.xml` (поле `<TestingStack>`) подставь команду:

| Framework | Command-формат |
|---|---|
| vitest | `pnpm test <module/path>` или `npx vitest run <pattern>` |
| jest | `pnpm test <module/path>` |
| pytest | `pytest tests/<path>.py -v` |
| JUnit 5 | `./gradlew test --tests <FQCN>` |
| cargo test | `cargo test <module::test>` |
| go test | `go test ./<package>/...` |
| xUnit | `dotnet test --filter <FQTM>` |
| XCTest | `swift test --filter <TestClass>` |

`<Cwd>` — каталог запуска относительно корня репозитория; для запуска из корня это `.` (значение по умолчанию).

**Шаг 2 — добавь `<Marker>` и `<TraceAssertion>` для каждого `V-M-*`.**

Marker — имя structured log-события, которое **должно** появиться при прогоне теста. Это привязка кода ↔ verification. Формат — квадратные скобки с двумя сегментами: `[<module>][<event>]`.

```xml
<V-M-AUTH-VALIDATE>
  <Priority>high</Priority>
  <Cwd>.</Cwd>
  <TestFiles>
    <File>tests/auth/test_validate.py</File>
  </TestFiles>
  <Command>pytest tests/auth/test_validate.py -v</Command>
  <Scenario>valid JWT → возвращает User</Scenario>
  <Marker>[auth][VALIDATE_SUCCESS]</Marker>
  <TraceAssertion>лог содержит VALIDATE_SUCCESS и user_id</TraceAssertion>
</V-M-AUTH-VALIDATE>
```

В коде (на шаге 06) логика будет включать marker:

```python
logger.info(
    "validate_success",
    extra={
        "anchor": "validate_user:BLOCK_DECODE_JWT",
        "module": "M-AUTH-VALIDATE",
        "marker": "[auth][VALIDATE_SUCCESS]",
        "user_id": user.id,
    },
)
```

**Шаг 3 — `<Priority>` из риск-класса модуля.**

| Риск-класс (scratchpad шага 04) | `<Priority>` |
|---|---|
| `critical` | `high` |
| `standard` | `medium` |
| `helper` | `low` |

Отдельного поля `criticality` в GRACE 4 нет — риск-класс модуля выражается именно через `<Priority>` его `V-M-*`.

**Шаг 4 — запиши записи в `.grace/verification/main.xml` и `Owns` в `.grace/verification/index.xml`.**

`.grace/verification/main.xml`:

```xml
<GraceVerificationDocument graceVersion="4.0">
  <VD-MAIN>
    <V-M-AUTH-TOKENS>
      <Priority>high</Priority>
      <Cwd>.</Cwd>
      <TestFiles>
        <File>tests/auth/test_tokens.py</File>
      </TestFiles>
      <Command>pytest tests/auth/test_tokens.py -v</Command>
      <Scenario>выпуск токена возвращает подписанный JWT</Scenario>
      <Scenario>просроченный токен отвергается</Scenario>
      <Marker>[auth][TOKEN_ISSUED]</Marker>
      <TraceAssertion>лог содержит TOKEN_ISSUED и ttl</TraceAssertion>
    </V-M-AUTH-TOKENS>
    <V-M-AUTH-VALIDATE>
      <Priority>high</Priority>
      <Cwd>.</Cwd>
      <TestFiles>
        <File>tests/auth/test_validate.py</File>
      </TestFiles>
      <Command>pytest tests/auth/test_validate.py -v</Command>
      <Scenario>valid JWT → возвращает User</Scenario>
      <Scenario>iat skew &gt; 60 с → возвращает null</Scenario>
      <Marker>[auth][VALIDATE_SUCCESS]</Marker>
      <TraceAssertion>лог содержит VALIDATE_SUCCESS и user_id</TraceAssertion>
    </V-M-AUTH-VALIDATE>
    <V-M-ROUTES-LOGIN>
      <Priority>medium</Priority>
      <Cwd>.</Cwd>
      <TestFiles>
        <File>tests/routes/test_login.py</File>
      </TestFiles>
      <Command>pytest tests/routes/test_login.py -v</Command>
      <Scenario>POST /login с валидными кредами возвращает 200</Scenario>
      <Marker>[routes][LOGIN_OK]</Marker>
      <TraceAssertion>лог содержит LOGIN_OK и status=200</TraceAssertion>
    </V-M-ROUTES-LOGIN>
  </VD-MAIN>
</GraceVerificationDocument>
```

`.grace/verification/index.xml` — `Owns` перечисляет **ровно** те `V-M-*`, что объявлены в `main.xml`:

```xml
<GraceVerificationIndex graceVersion="4.0">
  <VerificationDocuments>
    <VD-MAIN>
      <Path>verification/main.xml</Path>
      <Owns>
        <V-M-AUTH-TOKENS />
        <V-M-AUTH-VALIDATE />
        <V-M-ROUTES-LOGIN />
      </Owns>
    </VD-MAIN>
  </VerificationDocuments>
</GraceVerificationIndex>
```

Правила:
- `V-*` — **прямые дети** `VD-MAIN`; группировать нельзя (движок считает вложенные якоря ошибкой `nested-anchors`).
- id строго `V-<M-id>`: `M-AUTH-VALIDATE` → `V-M-AUTH-VALIDATE`. Иное имя — `projection.verification.dangling-module` или malformed-якорь.
- Ровно одна запись на модуль. Нет `V-M-XXX-01` / `V-M-XXX-02` — несколько сценариев это несколько `<Scenario>`.
- Каждый файл из `<TestFiles><File>` должен существовать на диске к моменту прогона гейта; иначе `verification.test-file-missing`. Тестовые файлы создаются на шаге 06 — до этого lint может ругаться именно на это, и это ожидаемо.
- Обязательных полей «Command должен быть непустым» движок не требует формально, но пустая запись получает warning `verification.placeholder` и не считается покрытием — заполняй `Command`/`Scenario`/`TestFiles` всегда.
- Каждый `M-*` **обязан** иметь `V-<M-id>`; иначе `projection.verification.missing-module-coverage`.

**Шаг 5 — проверь полноту и прогони гейт.**

```bash
grace lint --path . --format json
```

Ожидается: `summary.errors == 0`, exit code 0. Флагов `--json` / `--verbose` у `grace lint` в 4.x **нет** — JSON включается только `--format json`. Эквивалент через обёртку: `doubled-graph lint --path .` (rc=0 — чисто; rc=1 — есть находки; rc=3 — CLI не установлен; rc=4 — движок упал).

Чек-лист полноты:
- [ ] каждый `M-*` имеет ровно один `V-<M-id>`;
- [ ] `Owns` в `verification/index.xml` совпадает с набором записей в `main.xml`;
- [ ] каждый `V-M-*` имеет `<Command>`, `<Cwd>`, `<TestFiles><File>…</File></TestFiles>`, минимум один `<Scenario>`;
- [ ] у критических `V-M-*` есть `<Priority>high</Priority>` и хотя бы один `<Marker>`;
- [ ] нет warning'ов `verification.placeholder`.

**Шаг 6 — гейты (без отдельных XML-элементов).**

В GRACE 4 нет элементов `<Gate>`/`<EvalGate>`: гейт — это команда, которую агент запускает, и запись о ней в `spec.xml` (`<VerificationIntent>`) плюс CI-конфигурация репозитория. Обязательный baseline:

- локальный pre-commit: `doubled-graph lint --path .` + `doubled-graph detect-changes --scope staged`;
- pre-merge: `doubled-graph lint --path .` + `doubled-graph detect-changes --scope compare --base-ref main` + тестовый запуск из `<TestingStack>`;
- для `critical`-модулей — порог на golden dataset (пишется прозой в `<VerificationIntent>`): `pass-rate >= 0.85` на `datasets/golden/<module>.jsonl`. Golden dataset можно начать с 3–5 кейсов; наращивается со временем.

Зафиксируй это в `.grace/changes/active/C-001-INITIAL-BUILD/spec.xml`:

```xml
<VerificationIntent>
  <Intent>На каждый модуль — success- и failure-сценарий, marker в structured log.</Intent>
  <Intent>Pre-merge гейт: lint + detect-changes --scope compare --base-ref main + pytest.</Intent>
  <Intent>Eval-порог для critical: pass-rate &gt;= 0.85 на datasets/golden/auth-validate.jsonl.</Intent>
</VerificationIntent>
```

**Шаг 7 — approval:**

Покажи пользователю:

1. **Саммари**: сколько записей `V-M-*`, сколько сценариев, какие гейты (`pre-commit`, `pre-merge`), есть ли eval-порог.
2. **⚠ Что требует особого внимания**:
   - критические модули без failure-сценария;
   - критические модули без `<Marker>` (значит связь код ↔ verification будет слабой);
   - eval-порог на ещё не существующем golden dataset (dataset нужно завести до первого прогона);
   - `<Command>`, ссылающийся на тестовый файл, которого ещё нет (создаётся на шаге 06).
   Если ничего — «отклонений нет».
3. **Чек-лист одобрения** (echo из шага 5):
   - [ ] каждый `M-*` имеет ровно один `V-<M-id>`;
   - [ ] `Owns` совпадает с записями;
   - [ ] у каждого `V-M-*` есть `Command`, `Cwd`, `TestFiles`, `Scenario`;
   - [ ] у критических есть `Priority=high` и `<Marker>`;
   - [ ] pre-merge гейт зафиксирован в `<VerificationIntent>`;
   - [ ] если есть `critical`-модули — eval-порог и путь к dataset записаны.
4. **Вопрос**:

   > Verification plan готов. Чтобы одобрить — подтвердите явно по чек-листу выше. Если хотите добавить сценарий или marker — назовите модуль и что добавить.

Ответ «ок» без упоминания чек-листа — просьба пройти его явно.

---

## Переход

→ прочитай `prompts/new-project/06-generate.md` через Read tool и следуй его инструкциям.
