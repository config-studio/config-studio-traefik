# doubled-graph — после ручной правки человеком

**Триггер:**

- пользователь говорит «я поправил X сам, посмотри»;
- `prepare-commit-msg` hook добавил `DG-Authored: human` или `mixed`;
- в логах появились файлы, которых ИИ не трогал.

**Цель:** уважительно интегрировать ручные правки в дисциплину дрейфа — не удалять и не переписывать, но сверить с `.grace` и якорями.

**Маршрут:** MCP `doubled-graph.*`.

## Шаг 1 — пересчитать computed graph

Если правки ещё не закоммичены (post-commit hook не сработал): `doubled-graph.analyze(mode="incremental", paths=["<изменённые-файлы>"])`. PostToolUse hook ловит только ИИ-правки, поэтому при сомнении обнови сам.

## Шаг 2 — режим

Прочитай `AGENTS.md` (`<!-- doubled-graph:phase:start -->`): `migration` → skill `doubled-graph-drift` § A (код = ground-truth, ручные правки тоже); `post_migration` → дальше.

## Шаг 3 — drift check

```
doubled-graph.detect_changes(scope="branch", base_ref="main")
```

Именно `branch`, не `staged`: человек мог править за пределами одного коммита. Непусто → `doubled-graph-drift` § B.

## Шаг 4 — якоря

Ручные правки часто ломают разметку: забыт `END_BLOCK_*` после копипаста, остался `START_CONTRACT: oldName`, новый метод не попал в `MODULE_MAP`, `LINKS: M-*` стёрт.

```
doubled-graph.lint()
```

Упало — спроси:

> Ручная правка нарушила разметку в N файлах: <file>: `<END_BLOCK_DECODE_JWT>` отсутствует; `<file2>`: `START_CONTRACT: oldName` указывает на удалённую функцию.
> Починить автоматически (только якоря, без правки логики)?

«Да» — правь **только якоря**, повтори `lint()`. Логику не трогай.

## Шаг 5 — оформить изменение

- Семантика изменилась (экспорт/сигнатура, зависимость `M-*`, поведение под `V-<M-id>`) → активный бандл `.grace/changes/active/C-<slug>/`: `spec.xml` (`GraceChangeSpec status="draft"`, `approved` после согласования) + `plan.xml` (`GraceChangePlan`, `<T-001>`…), затем правки `.grace/graph/main.xml`, `graph/index.xml` (`<Owns>`), `verification/{main,index}.xml` (`<V-<M-id>>`).
- Ручная правка = новое требование → сначала `C-*` spec, потом `.grace`; не прячь её в правку кода.
- `CHANGE_SUMMARY` / `LAST_CHANGE` в GRACE 4 не обязателен: провенанс несёт `C-*` плюс `DG-Authored`-трейлер. Если секция в файле уже есть — допиши `LAST_CHANGE: <ISO> — <что> (DG-Authored: human)`.

## Чего НЕ делать

- **Не удаляй ручные правки** «потому что не по плану»: в `migration` они источник истины, в `post_migration` — возможное новое требование, решает пользователь.
- **Не меняй поведение кода** при фиксе разметки — только якоря.
- **Не пиши в `docs/DRIFT.md` сам** — это для нерешённых случаев.
- **Не утверждай «всё в порядке»** без `lint` + `detect_changes`.
- **Не возвращай** `UC-*` и атрибуты якорей (`NAME=`, `PRIORITY=`) — синтаксис 3.x.

## Шпаргалка

```
MANUAL-EDIT (MCP):
1. analyze(mode="incremental", paths=[touched])
2. read AGENTS.md phase -> migration? goto doubled-graph-drift § A
3. detect_changes(scope="branch", base_ref="main") -> drift? § B
4. lint(); сломаны якоря -> ask user -> правим только якоря
5. .grace: C-*/{spec,plan} + graph/{main,index} + verification/{main,index}
6. LAST_CHANGE (DG-Authored: human), если секция есть
7. commit: Affected / Change / DG-Authored
```
