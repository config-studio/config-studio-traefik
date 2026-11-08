# on-drift-detected — обнаружен дрейф

**Целевая аудитория:** ИИ-ассистент.
**Триггер:** `doubled-graph detect-changes` вернул непустой `drift`.

Типы drift'а в 2.0: `code_without_module`, `module_without_code`, `stale_crosslinks`, `missing_verification`, `markup_missing`.

См. также: skill `doubled-graph-drift` (полная версия), `methodology/drift-and-priority.md`, `methodology/principles.md § Операционный паттерн — externalize state`.

---

## Externalize state (обязательно)

Drift из 5+ items, каждый — решение пользователя. К 7-му item локалка забудет первые. Журнал обязателен.

- Файл: `.doubled-graph/drafts/drift-session-<ISO>.md` — append-only.
- Поля per item: `тип`, `target`, `время`, `user-decision` (`new-req` / `bug` / `defer`), `next action`, `status`.
- Конец сессии — `Status: completed`, не удалять (audit trail).

---

## Шаг 0 — определи режим

Режим определяется командой (единственный источник истины):

```bash
doubled-graph phase get --repo .
```

`AGENTS.md` phase-блок — только для чтения человеком; если он расходится с выводом команды, истина — вывод команды.

- **`migration`** → § A.
- **`post_migration`** → § B.

---

## § A. Режим `migration`

Код = ground-truth. Артефакты догоняют без вопросов.

**A.1 — пройди по items drift'а и обнови `.grace` через `Edit`.** Маппинг типов:

| тип drift'а | что править |
|---|---|
| `code_without_module` | `.grace/graph/main.xml` — добавить `M-*` (поля `Name`, `Status`, `Summary`, `Path`, `<Depends>`), плюс строку с новым `M-*` (например `<M-ORDERS-EXPORT />`) в `<Owns>` `.grace/graph/index.xml`. Границы модуля определяй по `SCOPE` контракта файла; если `SCOPE` отсутствует — по ближайшему каталогу, содержащему файл (`dirname` от пути). Только этот вариант, вопрос пользователю не задаётся |
| `module_without_code` | `.grace/graph/main.xml` — поправить `<Path>`/`<Status>`; если модуль больше не существует — согласовать удаление и убрать его из `Owns` |
| `stale_crosslinks` | `.grace/graph/main.xml` — удалить устаревший вложенный якорь из `<Depends>` |
| `missing_verification` | `.grace/verification/main.xml` — добавить `V-<M-id>` + строку в `Owns` `.grace/verification/index.xml` (skill `doubled-graph-verify`) |
| `markup_missing` | в самом код-файле — добавить `MODULE_CONTRACT`/`MODULE_MAP` (см. § B.5) |

Возьми текущий контракт через `doubled-graph module show <M-id> --with-verification --repo .` как baseline.

**A.2 — ревью diff.** Покажи пользователю `git diff .grace/`. Пользователь подтверждает: «ок, коммить» → коммит `chore(sync): sync .grace after code changes`; «откати X» → правишь по инструкции.

**A.3 — вернись на `on-after-edit.md` шаг 4** (`lint` + тесты).

---

## § B. Режим `post_migration`

Артефакты `.grace` = ground-truth. Дрейф — подозрение на баг или неодобренное требование. Обрабатывай **каждый тип отдельно**.

Правило режима: любое изменение поведения (а значит и `summary`/`Depends`/`V-<M-id>`) проходит через активный бандл `C-*`. Без бандла — только чисто разметочные правки (`markup_missing`).

### B.1 — `code_without_module`
Функция / класс есть в коде, не покрыт ни одним `M-*`. Возможные причины: файл без `LINKS: M-*` (тогда это не новый код, а сломанная разметка) или действительно новый код. Спроси:

> Обнаружен код без модуля: `<file>:<line> — <function/class>`
>
> Варианты:
> (a) новое требование — завожу бандл `.grace/changes/active/C-<NNN>-<SLUG>/` (spec.xml + plan.xml с `T-###`), после approval добавляю `M-*` в `.grace/graph/main.xml` (+`Owns`) и `V-<M-id>`, размечаю код якорями;
> (b) баг (код не должен был попасть) — удаляю файл/функцию через `Edit` в рамках бандла;
> (c) это существующий модуль, просто `LINKS` потерял `M-*` — правлю `LINKS` (чисто разметочная правка, бандл не нужен);
> (d) вспомогательный dev/test код — выношу в `tests/` или `dev/`, помечаю исключением в конфиге скана;
> (e) не знаю — пишу в `docs/DRIFT.md`, модуль-кандидат блокируется до решения.

### B.2 — `module_without_code`
`M-*` есть в `.grace/graph/main.xml`, файлов нет. Если в `docs/DRIFT.md` запись про этот модуль с не истекшим deadline → пропусти. Иначе спроси: (a) пометить `<Status>deprecated</Status>` и убрать `<Path>` (в рамках бандла); (b) забыли реализовать → создаём задачу `T-###` в активном бандле.

### B.3 — `stale_crosslinks`
`<Depends>` содержит `M-B`, а в computed graph вызовов между модулями нет.

- Намеренный рефакторинг → `Edit` `.grace/graph/main.xml`, убери вложенный `<M-B />` из `<Depends>` после подтверждения пользователя. Других ссылок между модулями в GRACE 4 нет (никаких `CrossLink`-элементов).
- Подозрительно (потеря связи) → `docs/DRIFT.md`, спроси, не потерялась ли функциональность.

### B.4 — `missing_verification`
`M-*` есть код, нет `V-<M-id>`. Активируй skill `doubled-graph-verify`. Порядок:

```bash
doubled-graph verify V-<M-id> --repo .   # что уже есть: запись V-M-* (или модуль — движок резолвит оба)
```

Затем добавь запись в `.grace/verification/main.xml` (`Priority`, `Cwd`, `TestFiles`/`File`, `Command`, `Scenario`, `Marker`, `TraceAssertion`) и строку с этим `V-*` id (например `<V-M-AUTH-VALIDATE />`) в `<Owns>` `.grace/verification/index.xml`.

Проверка готовности модуля: `doubled-graph module health <M-id> --repo .` (пустая verification = модуль не готов).

Если пользователь откладывает (для `Priority=high`) — заблокируй pre-merge гейт для этого модуля и запиши блокер в `docs/DRIFT.md` с deadline.

### B.5 — `markup_missing`
В файле нет `MODULE_CONTRACT` или `MODULE_MAP`. Добавь разметку **руками** по конвенции комментариев языка:
- C-family / Java / Go / Rust / TS / JS: `// START_MODULE_CONTRACT` … `// END_MODULE_CONTRACT`
- Python / Ruby / shell: `# START_MODULE_CONTRACT` …
- HTML / XML / Vue templates: `<!-- START_MODULE_CONTRACT --> …`
- SQL / Lua: `-- START_MODULE_CONTRACT` …
- C# / VB: `// START_MODULE_CONTRACT` … плюс, если нужен нативный region, `#region START_BLOCK_NAME` … `#endregion END_BLOCK_NAME` (region парный с якорем).

Обязательные поля: `MODULE`, `PURPOSE`, `SCOPE`, `DEPENDS`, `LINKS` (`LINKS` обязан содержать `M-*`), плюс пара `ROLE` ↔ `MAP_MODE` (`RUNTIME`→`EXPORTS`, `TEST`→`LOCALS`, `BARREL`→`SUMMARY`, `CONFIG`→`NONE`, `TYPES`→`EXPORTS`, `SCRIPT`→`LOCALS`).

Проверь результат: `doubled-graph lint --path .` (или `grace lint --path . --format json`).

### B.6 — контрактное расхождение (не drift-тип)

`detect_changes` в 2.0 не эмитит `contract_mismatch` — расхождение «заявленный контракт ≠ реальная сигнатура» ловится вручную, при ревью:

```bash
doubled-graph module show <M-id> --with-verification --repo .
doubled-graph file show <path> --contracts --repo .
```

Если `PURPOSE`/`SCOPE` модуля или `CONTRACT:fn` разошлись с кодом — оформи как бандл `C-*` (`AcceptanceCriteria` = новое поведение), затем правь `.grace/graph/main.xml` (`<Summary>`, `<Depends>`), `V-<M-id>` и код.

---

## Шаг B.N — после обработки всех типов

1. Повтори:

   ```bash
   doubled-graph detect-changes --scope staged --repo .
   ```

   Непусто → к соответствующему §.
2. Пусто → возвращайся в `on-after-edit.md` шаг 4.

---

## Записи в `docs/DRIFT.md`

«Не знаю» создаёт запись:

```markdown
## D-042 — M-AUTH-VALIDATE: расхождение контракта (2026-04-18)

**Тип:** contract_mismatch (ручная находка; detect_changes такой тип не эмитит).
**Обнаружено:** `doubled-graph file show src/auth/validate.py --contracts` в коммите `abc1234`.
**Суть:** `<Summary>` модуля заявляет 1 аргумент, реальная сигнатура — 2.
**Решение откладывается. До решения — модуль M-AUTH-VALIDATE заблокирован для ИИ-правок.**
**Deadline:** 2026-04-22 (assumed).
**Owner:** <никто пока>.
```

`docs/DRIFT.md` — markdown (не XML), его читает `doubled-graph health` (`drift_md.open_entries`). Коммить отдельным коммитом: `docs(drift): register D-042 on M-AUTH-VALIDATE contract drift`.
