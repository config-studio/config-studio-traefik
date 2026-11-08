---
name: doubled-graph-verify
description: "Use when a module M-* is missing its V-<M-id> verification record, when detect_changes returns missing_verification, or when the user asks for tests of a module. Drafts the single V-M-* record plus a minimal test scaffold. Triggers: add tests for M-X, missing verification, verification.placeholder."
---

# doubled-graph — добавить verification для модуля

**Триггер:** `detect_changes()` вернул `missing_verification`; `health` показывает `modules.without_verification`; `lint` — `verification.placeholder`; пользователь сказал «добавь тесты для `M-X`».

**Цель:** у каждого `M-*` есть `V-<M-id>` с реальными `Command`/`Scenario`/`TestFiles`, а не пустая заглушка.

**Правило GRACE 4:** запись **одна на модуль**, id ровно `V-<M-id>` (`M-AUTH-VALIDATE` → `V-M-AUTH-VALIDATE`). Кейсы живут внутри неё как несколько `<Command>`/`<Scenario>`/`<Marker>`, а не как `V-M-AUTH-1..3`.

## Шаг 1 — контракт и текущее состояние

```
doubled-graph.module_show(target="<M-id>", with_verification=true)
doubled-graph verify V-<M-id>           # что уже есть (или not found)
doubled-graph module health <M-id>      # чего не хватает до autonomy
```

Нужны `Status`, `Summary`, `Exports` модуля и `Priority`/`Command`/`TestFiles` существующей записи.

## Шаг 2 — scope покрытия

| Сигнал | Что покрыть |
|---|---|
| `<Priority>high</Priority>` / модуль на критическом пути | каждый публичный экспорт, все pre/post/invariant, edge cases (null, empty, oversize), error paths |
| обычный модуль | каждый экспорт: happy path + один представительный error case |
| helper / утилита | smoke (вызывается без исключения) + 1 happy path |

`Priority` не задан — спроси пользователя и запиши ответ в `<Priority>`.

## Шаг 3 — стек и путь теста

Стек — `.grace/context/technology.xml` (`<TestingStack>`), затем `package.json` / `pyproject.toml` / `Cargo.toml`. Путь — по конвенции репо (`tests/test_<slug>.py`, `__tests__/<module>.test.ts`). Не нашёл — спроси.

## Шаг 4 — stub теста

`Edit` нового файла; в шапке `MODULE_CONTRACT` с `LINKS: M-<ID>` — единственная связь файла с модулем в GRACE 4:

```python
# START_MODULE_CONTRACT
# MODULE: M-AUTH-VALIDATE
# LINKS: M-AUTH-VALIDATE
# ROLE: TEST
# MAP_MODE: LOCALS
# END_MODULE_CONTRACT
```

Тестируй контракт (публичные экспорты), а не internal state.

## Шаг 5 — запись `V-<M-id>`

В `.grace/verification/main.xml`, внутри своей `VD-*` секции:

```xml
<V-M-AUTH-VALIDATE>
  <Priority>high</Priority>
  <Cwd>.</Cwd>
  <TestFiles><File>tests/test_auth_validate.py</File></TestFiles>
  <Scenario>valid token returns user</Scenario>
  <Scenario>invalid token returns null</Scenario>
  <Command>pytest tests/test_auth_validate.py::test_valid_token</Command>
  <Marker>[auth][validate][ok]</Marker>
  <TraceAssertion>validateUser returns None, no exception</TraceAssertion>
</V-M-AUTH-VALIDATE>
```

Плюс `<V-M-AUTH-VALIDATE/>` в `<Owns>` своего `VD-*` в `.grace/verification/index.xml`. Якорь — тег без атрибутов; `<File>` — путь от корня репо и файл обязан существовать (`verification.test-file-missing`). Если запись уже есть как пустая заглушка — **дополни** её, вторую не создавай (`projection.verification.duplicate-anchor`).

## Шаг 6 — прогон

`doubled-graph verify V-<M-id>` → выполни её `<Command>` через Bash (или напрямую `pytest …`). Красное не коммить.

## Шаг 7 — финальные gate'ы

```
doubled-graph.lint()                          # нет missing-module-coverage / placeholder
doubled-graph.detect_changes(scope="staged")  # missing_verification исчез для M-<ID>
doubled-graph module health <M-id>
```

Остался `missing_verification` — записи нет вообще, создай её (шаг 5). Остался `verification.placeholder` — запись пустая, добавь `Command`/`Scenario`/`TestFiles`.

## Шаг 8 — коммит

```
test: add V-<M-id> verification for <M-ID>

Affected: <M-ID>
Change: C-<slug>
```

## Anti-patterns

- Не пиши тест без записи `V-<M-id>`: `lint` даст `projection.verification.missing-module-coverage`, `detect_changes` — `missing_verification`.
- Не плоди `V-M-X-1`, `V-M-X-2` — id один, кейсы внутри записи.
- Не выдумывай `<Command>` ради зелёного gate: `verification.placeholder` честнее фальшивого «verified».
- Не ссылайся в `<File>` на несуществующий тест и не генерируй тесты пачкой «для всех модулей».

## Шпаргалка

```
VERIFY (одна V-<M-id> на модуль):
1. module_show(<M-id>, with_verification=true); doubled-graph verify V-<M-id>
2. scope: high -> full; обычный -> happy+error; helper -> smoke
3. stack <- .grace/context/technology.xml; path <- конвенция репо
4. Edit test-file: MODULE_CONTRACT + LINKS: M-<ID> (+ ROLE/MAP_MODE)
5. Edit verification/main.xml -> <V-<M-id>>; verification/index.xml -> <Owns>
6. run <Command> via Bash
7. lint() + detect_changes() чисто; doubled-graph module health <M-id>
8. commit "test: add V-<M-id> for <M-ID>"
```
