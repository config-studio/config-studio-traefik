# doubled-graph — обнаружен дрейф

**Триггер:** `doubled-graph.detect_changes()` вернул непустой drift.

Дрейф из 5+ items — это 5+ решений; локальная модель теряет первые. **Журнал обязателен.**

**Маршрут:** MCP `doubled-graph.*`; Bash — `git diff`, `git commit`.

## Externalize state

`.doubled-graph/drafts/drift-session-<ISO>.md`, append-only. На item: `тип`, `target`, `время`, `user-decision` (`new-req`/`bug`/`defer`), `C-*` бандл, `next`, `status`. В конце — `Status: completed`; файл не удалять.

```markdown
## item-3 (2026-10-23T10:22:04Z)
- type: contract_mismatch   target: M-AUTH-VALIDATE
- decision: bug             bundle: C-fix-auth-validate
- next: вернуть сигнатуру под <M-AUTH-VALIDATE>   status: in-progress
```

## Шаг 0 — режим

`AGENTS.md`, блок `<!-- doubled-graph:phase:start -->`: `migration` → § A, `post_migration` → § B (default, если файла нет).

## § A. `migration` — артефакты догоняют код

Каждое изменение — бандл `.grace/changes/active/C-<slug>/`: `spec.xml` (`GraceChangeSpec status="draft"` → `approved`, обязательные секции) + `plan.xml` (`GraceChangePlan`, задачи `<T-001>` с `Title`/`DependsOn`/`AcceptanceCriteria`/`Verification`).

| тип | правка |
|---|---|
| `code_without_module` | `<M-NEW>` в `.grace/graph/main.xml` (`Name`/`Status`/`Summary`/`Path`) + `<M-NEW/>` в `<Owns>` `graph/index.xml` + `<V-M-NEW>` в `verification/main.xml` и её `<Owns>` + `LINKS: M-NEW` в коде |
| `module_without_code` | `<Status>deprecated</Status>` (или удалить `<M-*>`, `V-<M>` и записи `Owns`) |
| `contract_mismatch` | поправить `Summary`/`Exports`/вложенные зависимости; смена сигнатуры — отдельный `C-*` spec |
| `stale_crosslinks` | убрать вложенный `<M-B/>` из `<M-A>` |
| `missing_verification` | `<V-<M-id>>` — skill `doubled-graph-verify` |
| `markup_missing` | `MODULE_CONTRACT` + `LINKS: M-*` в код; `ROLE`↔`MAP_MODE`: `RUNTIME`→`EXPORTS`, `TEST`→`LOCALS`, `BARREL`→`SUMMARY`, `CONFIG`→`NONE`, `TYPES`→`EXPORTS`, `SCRIPT`→`LOCALS` |

Baseline — `doubled-graph.module_show(<M-id>)`. Ревью: `git diff .grace/`, ответ «ок, коммить» (`chore(sync): …`) или «откати X». Затем `doubled-graph-after-edit` шаг 4.

## § B. `post_migration` — артефакты = ground-truth

Дрейф = подозрение на баг или неодобренное требование. Разбирай **по типам**, не «refresh всё».

- **`code_without_module`** — спроси: (a) новое требование → `C-*` spec `draft`→`approved`, `<M-*>` в `graph/main.xml`, `<Owns>`, `<V-<M>>`, `LINKS: M-*`; (b) баг → удалить код; (c) dev/test → в `tests/`/`dev/`; (d) не знаю → `docs/DRIFT.md`.
- **`module_without_code`** — запись в `DRIFT.md` с живым deadline → пропусти. Иначе `<Status>deprecated</Status>` + бандл `superseded`, либо задача в `plan.xml`.
- **`contract_mismatch`** — (a) новое требование → `C-*` spec + `Summary`/`Exports`/`V-<M-id>`, коммит с `Contract-change:`; (b) баг → вернуть код под контракт; (c) `DRIFT.md`.
- **`stale_crosslinks`** — намеренно → убрать вложенный якорь из `<M-A>`; подозрительно → `DRIFT.md`.
- **`missing_verification`** / `verification.placeholder` — skill `doubled-graph-verify` (`doubled-graph verify V-<M-id>`, `doubled-graph module health <M-id>`); helper → `DRIFT.md` «verification pending».
- **`markup_missing`** — `MODULE_CONTRACT`/`MODULE_MAP` руками по комментарию языка, обязательно `LINKS: M-*`; затем `doubled-graph.lint()`.

После — `detect_changes(scope="staged")`: непусто → свой пункт; пусто → `after-edit` шаг 4.

## `docs/DRIFT.md`

```markdown
## D-042 — M-AUTH-VALIDATE contract_mismatch (2026-10-23)
**Тип:** contract_mismatch. **Обнаружено:** `detect_changes()` в `abc1234`.
**Суть:** контракт заявляет 1 аргумент, реальная сигнатура — 2.
**До решения модуль заблокирован для ИИ-правок.** Deadline: 2026-10-27.
```

## Anti-patterns

- Не «refresh всё» в `post_migration` — маскирует баги.
- Не писать в `DRIFT.md` без явного «не знаю».
- Не блокировать модуль без записи в `DRIFT.md`.
- Не менять `.grace` без `C-*` и не смешивать артефакты с кодом в одном коммите.

## Шпаргалка

```
read AGENTS.md phase
migration      -> C-* + правка по таблице § A; git diff .grace/; confirm; commit chore(sync)
post_migration -> по типу: new-req (C-* spec) | bug (code) | dev (tests/) | DRIFT.md
                  stale_crosslinks -> убрать вложенный <M-B>
                  missing_verification -> skill doubled-graph-verify
                  markup_missing -> MODULE_CONTRACT + LINKS: M-* -> lint()
-> detect_changes(staged) until empty -> after-edit step 4
```
