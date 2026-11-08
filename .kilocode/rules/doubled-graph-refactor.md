# doubled-graph — рефакторинг (rename / move / split / extract)

**Триггер:** просьба переименовать, переместить, разделить или извлечь функцию/класс/модуль.
**Цель:** не потерять ни одного caller'а, не разорвать якоря в `.grace`, не оставить висячих `V-M-*`.

**Маршрут:** `impact()` собирает blast radius, дальше атомарные `Edit`. Финальный gate — `lint()` + `detect_changes()`.

## Шаг 1 — blast radius

```
doubled-graph.impact(target="<старое-имя>", direction="upstream", depth=3)
```

`target_resolved.module_id`, `direct[]`/`transitive[]`, `affected_modules[]`, `affected_verification[]`, `risk.level`. `risk.level >= HIGH` — **стоп**, покажи `risk.reasons`, жди подтверждения.

## Шаг 2 — найти все ссылки на старое имя

Ручной поиск по `.grace/` и коду:

```bash
grep -rn "<старое-имя>" .grace/ src/ tests/
```

Что обновляется:

- `<M-...>` в `.grace/graph/main.xml`: `Name`, `Summary`, `Path`, `Exports`;
- вложенные якоря-зависимости `<M-OLD/>` внутри других `<M-*>` (в GRACE 4 это и есть «crosslink»);
- `<V-<M-id>>` в `.grace/verification/main.xml` и `<Owns>` в `verification/index.xml`;
- `<Owns>` в `.grace/graph/index.xml` (если переименовывается модуль);
- `LINKS: M-*` и `MODULE_MAP` внутри `MODULE_CONTRACT` в код-файлах.

## Шаг 3 — план пользователю

```
План рефакторинга <старое> → <новое>:
CODE EDITS (N): src/auth/login.ts:42 (call site), src/auth/validate.ts:10 (def)
.GRACE EDITS (M): graph/main.xml:23 (<M-AUTH> Name/Summary), graph/index.xml:8 (<Owns>),
                  verification/main.xml:12 (<V-M-AUTH>), code: LINKS: M-AUTH
CHANGE BUNDLE: .grace/changes/active/C-rename-auth/
RISK: MEDIUM (12 callers, 1 affected V-<M>)
```

Жди «ок, поехали» или «откати X».

## Шаг 4 — применить атомарно

**Сначала код, потом `.grace`.** Упавшая посередине правка кода оставляет репо с прежним именем во всех артефактах — консистентно.

Whole-word replacement через `Edit` с контекстом (сигнатура / строка вызова / тег целиком), не blind sed: sed попадёт в комментарии, строки, частичные совпадения.

## Шаг 5 — `C-*` бандл

`.grace/changes/active/C-<slug>/`: `spec.xml` (`GraceChangeSpec status="draft"` → `approved`, якорь `<C-<slug>>`) + `plan.xml` (`GraceChangePlan` с `<T-001>`, `<T-002>` — код, `.grace`, тесты). Переименование модуля и смена сигнатуры — отдельные задачи плана.

## Шаг 6 — проверка

```
doubled-graph.analyze(mode="incremental", paths=[<все тронутые файлы>])
doubled-graph.lint()
doubled-graph.detect_changes(scope="staged")
```

- `lint` упал: сломаны якоря/`Owns`/ID-ссылки — найди и поправь.
- `stale_crosslinks`: пропущен вложенный `<M-*>` в `.grace/graph/main.xml`.
- `code_without_module`: не обновлён `Name`/`Path`/`Exports` у `<M-*>` или `LINKS: M-*` в коде.
- `contract_mismatch`: сменилась сигнатура — это уже не rename, иди в `doubled-graph-before-edit`.

## Шаг 7 — тесты и коммит

Прогони `<Command>` всех `affected_verification` (`doubled-graph verify <V-M-id>`). Упало — откат `git restore` или быстрый фикс.

```
refactor: rename <старое> → <новое>

Affected: <M-ids>
Change: C-<slug>
M-rename: M-OLD → M-NEW   # если менялся id
```

## Сложные случаи

- **Move** (функция в другой модуль): обновляй ссылки на оба модуля; `Exports` и `Path` переезжают между `<M-*>`; в коде меняется `LINKS: M-*`.
- **Split / Extract**: это не rename — новый `M-*` требует `<Owns>` + `<V-<M>>` + `C-*` spec, дальше цикл `before-edit`.
- **Merge**: старый `M-*` → `<Status>deprecated</Status>`, его `V-<M>` удаляется, в архив — бандл со `superseded`.

## Anti-patterns

- Не делать blind sed/grep-replace без `impact` — пропустишь динамические ссылки, конфиги, тесты.
- Не править только код — `detect_changes` даст `stale_crosslinks`.
- Не править только `.grace` — дрейф наоборот.
- Не проводить contract change (другая сигнатура) внутри rename — это `C-*` spec + approval.

## Шпаргалка

```
REFACTOR (rename):
1. impact(target=<old>, direction="upstream", depth=3); HIGH/CRITICAL -> STOP
2. grep .grace/ src/ tests/ for <old>
3. plan: code edits + .grace edits (+ <Owns>) + C-* bundle + risk
4. user "ок" -> apply code first, then .grace
5. C-*/{spec,plan}
6. analyze + lint + detect_changes
7. run V-<M> <Command> -> commit "refactor: …" (Affected / Change)
Move/Split/Extract -> не rename, через doubled-graph-before-edit + C-* spec
```
