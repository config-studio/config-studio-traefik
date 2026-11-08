# on-user-manual-edit — после ручной правки человеком

**Целевая аудитория:** ИИ-ассистент.
**Триггер:** пользователь сделал правку в коде без участия ИИ. Возможные сигналы:
- в logs `post-commit` появилось событие с `affected files`, которых ИИ в последний час не трогал;
- `prepare-commit-msg` hook добавил `DG-Authored: human` или `DG-Authored: mixed`;
- пользователь явно говорит «я поправил X сам, посмотри».

См. также: skill `doubled-graph-manual-edit` (полная версия).

---

## Шаги

**1. Пересчитай computed graph.** Если `post-commit` hook ещё не запустился (правки на диске, ещё не коммит):

```bash
doubled-graph analyze --mode incremental --paths <изменённые-файлы> --repo .
```

**2. Прочитай `AGENTS.md` phase.**

- `migration` → следуй `on-drift-detected.md § A`.
- `post_migration` → продолжай ниже.

**3. Проверь дрейф.**

```bash
doubled-graph detect-changes --scope branch --base-ref main --repo .
```

(`--scope branch` вместо `staged`, потому что пользователь мог править за пределами единичного коммита.)

- `drift` пуст — всё в порядке. Дальше — шаги 4–6.
- `drift` непуст → перейди на `on-drift-detected.md § B`.

**4. Проверь разметку в изменённых файлах.** Ручные правки часто **ломают** якоря: забыли `END_BLOCK_*`, переименовали функцию (старое `CONTRACT: oldName` осталось), добавили метод без обновления `MODULE_MAP`, потеряли `LINKS`.

Начни с быстрого извлечения разметки (без чтения всего файла):

```bash
doubled-graph file show <path> --contracts --blocks --repo .
```

Чего именно искать по языкам (частые случаи — `.py` и `.cs`):

| Язык | Открытие/закрытие | Обязательно проверить |
|---|---|---|
| Python (`.py`) | `# START_MODULE_CONTRACT` … `# END_MODULE_CONTRACT`; блоки `# START_BLOCK_<NAME>` | `PURPOSE`, `SCOPE`, `DEPENDS`, `LINKS: M-*`; пара `ROLE` ↔ `MAP_MODE` (`SCRIPT`→`LOCALS`, `TEST`→`LOCALS`, `RUNTIME`→`EXPORTS`); `# START_MODULE_MAP` со строками `symbol - описание` |
| C# (`.cs`) | `// START_MODULE_CONTRACT` … `// END_MODULE_CONTRACT`; при использовании регионов — `#region START_BLOCK_<NAME>` … `#endregion END_BLOCK_<NAME>` | тот же набор полей; `LINKS` без `M-*` = файл не привязан ни к одному модулю; `MAP_MODE` соответствует `ROLE` (`RUNTIME`→`EXPORTS`, `CONFIG`→`NONE`, `TYPES`→`EXPORTS`) |
| TS/JS/Java/Go/Rust | `// START_*` | `CONTRACT: fn` не остался со старым именем функции |
| SQL/Lua | `-- START_*` | то же |

Проверка линтером:

```bash
doubled-graph lint --path .
```

Если rc=1 / есть находки — спроси: «Ручная правка нарушила разметку в N файлах: <список находок>. Могу починить автоматически (только якоря, без правки логики). Разрешить?»

Если да — правь **только якоря** через `Edit`, повтори `doubled-graph lint --path .`. **Не меняй логику кода.**

**5. Проверь `.grace`-покрытие.** Файл считается покрытым, только если его `MODULE_CONTRACT` содержит `LINKS: M-*` и такой модуль объявлен в `.grace/graph/main.xml`.

```bash
doubled-graph module find <path> --repo .
doubled-graph status --repo .              # artifacts.project_kind должен быть grace4
```

- Модуль найден и `Owns` в `.grace/graph/index.xml` его содержит → покрытие есть.
- Модуля нет, а код появился → это `code_without_module`. Проверяй в этом порядке: (1) `doubled-graph file show <путь> --repo .` — если `MODULE:` есть, значит `LINKS` потерял `M-*` → чисто разметочная правка; (2) если `MODULE:` нет — правка добавила новый модуль → нужен бандл `C-*` (`on-drift-detected.md § B.1`). Первый сработавший вариант определяет действие.
- Модуль есть, но `<Path>` не соответствует реальному файлу → поправь `<Path>`/`<Summary>` в `.grace/graph/main.xml`.
- У модуля нет `V-<M-id>` → `missing_verification`, см. `on-drift-detected.md § B.4`.

Инструменты для сверки: `doubled-graph module show <M-id> --with-verification --repo .`, `doubled-graph verify V-<M-id> --repo .`, `doubled-graph module health <M-id> --repo .`.

**6. Обнови `CHANGE_SUMMARY` (если секция есть).** `CHANGE_SUMMARY` в GRACE 4 не обязателен, но если в файле он уже есть — добавь запись (синтаксис комментария — по языку файла):

```
// START_CHANGE_SUMMARY
// LAST_CHANGE: 2026-04-18 — <краткое описание ручной правки> (DG-Authored: human)
// END_CHANGE_SUMMARY
```

Для Python — те же строки с `#`, для C# — с `//`. Без `LAST_CHANGE` внутри секции `grace lint` ругается.

Зачем: провенанс при будущих drift-investigations; формальная фиксация что правка прошла с пониманием контекста; разделение «что наработал ИИ» vs «что наработал человек» — критично для post-mortem.

**7. Если семантика изменилась — обнови `.grace` через бандл.** Если ручная правка изменила публичные экспорты, зависимости (новый импорт из другого `M-*`), или затронула проверку — нужен активный бандл `.grace/changes/active/C-<NNN>-<SLUG>/` (`spec.xml`: `Summary`/`Goals`/`AcceptanceCriteria`/`AffectedAreas`; `plan.xml`: `T-###`, `ObservedWriteScope`), затем:

- `.grace/graph/main.xml` — `<Status>`, `<Path>`, `<Summary>`, `<Depends>` модуля (+`Owns`, если якорь новый);
- `.grace/verification/main.xml` — `V-<M-id>` (Command/Scenario/Marker/TestFiles под новую реальность);
- `spec.xml` → атрибут `status="applied"` у корня `GraceChangeSpec` (и у `GraceChangePlan`), затем бандл в `.grace/changes/archive/`.

Без семантических изменений достаточно шагов 4–6 (разметка) и обычного коммита.

---

## Чего НЕ делать

- **Не удаляй ручные правки** «потому что они не соответствуют плану». В `migration` они = источник истины. В `post_migration` — возможное новое требование, решает пользователь.
- **Не меняй поведение кода при фиксе разметки.** Только якоря.
- **Не пиши в `docs/DRIFT.md` сам.** Это для нерешённых случаев — пользователь подписывает.
- **Не правь `docs/*.xml`.** Это legacy GRACE 3; артефакты живут в `.grace/`.
- Не переключай `phase:` вручную — только `doubled-graph phase set <value> --repo .`.
