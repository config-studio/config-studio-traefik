# Обновление версии методики — вход

**Скопируй этот текст в свой ИИ-ассистент** как первое сообщение после обновления пакета `doubled-graph` (1.9.x → 2.0).

## Что это за сценарий

Три независимых сценария, не путай их:

| Сценарий | Каталог | Когда |
|---|---|---|
| 1. Новый проект | `prompts/new-project/` | кода нет, проект только начинается |
| 2. Миграция существующего | `prompts/migrate-existing-project/` | код есть, методологии в репозитории не было или она в GRACE 3 |
| **3. Обновление версии методики** | **этот каталог** | **методология уже внедрена, но версия пакета старая (1.9.x на `docs/*.xml`); нужно перейти на 2.0 (GRACE 4, `.grace`)** |

Ключевое отличие: в сценарии 3 у тебя **уже есть** артефакты и разметка (GRACE 3 в `docs/*.xml`), и обновление не должно требовать повторного прохождения миграции «с нуля». Шаги 2-го сценария здесь не запускаются.

## Что меняется в 2.0 (одним абзацем)

Движок `@osovv/grace-cli` 4.2.1 валидирует только `.grace`/`: пять context-документов, `graph/{index,main}.xml`, `verification/{index,main}.xml`, `changes/{active,archive}`. Legacy `docs/*.xml` остаётся на диске, но движок его больше не читает: на таком репозитории `lint` возвращает `project.grace3-detected`, а query-команды — `invalid-project`. Поэтому обновление = обновить пакет → `setup` (он обновит движок и перенесёт артефакты) → закрыть содержательные пробелы по коду и тестам.

## Порядок действий (детерминированный)

1. Обновить пакет:

```bash
pipx upgrade doubled-graph
```

2. Проверить состояние (только чтение):

```bash
doubled-graph status --repo .
```

Смотри два поля: `grace_engine.detected.version` (должна быть 4.x, `upgrade_required: false`) и `artifacts.project_kind` (`grace3` — ещё не перенесено, `grace4` — перенесено, `none` — артефактов не было).

3. Обновить движок и артефакты одной командой:

```bash
doubled-graph setup --repo .
```

Что делает `setup`: ставит/обновляет `@osovv/grace-cli@4.2.1` (ранее установленный 3.x считается кандидатом на обновление), при `grace3` переносит `docs/*.xml` → `.grace` (legacy **не** изменяется и **не** удаляется), при `none` создаёт пустой скелет, добавляет `LINKS: M-*` в `MODULE_CONTRACT`, выравнивает `ROLE`↔`MAP_MODE`, копирует актуальные `prompts/` и `methodology/`, пишет отчёт.

4. Проверить результат командами:

```bash
doubled-graph status --repo .     # artifacts.project_kind = grace4, grace_engine.upgrade_required = false
doubled-graph migrate check --repo .   # map_pending / placeholders / markup_pending
doubled-graph lint --repo .       # summary.errors
```

5. Закрыть содержательные пробелы по готовому промпту:

```
prompts/upgrade-methodology/01-content-gaps.md
```

Первым его шагом идёт **Шаг 0 — context-документы**: если `migrate check` показывает `context_gaps` (legacy объявил 0–1 поле), ИИ заполняет `technology.xml` (в первую очередь `TestingStack`) и `requirements.xml` из `<LegacySource>` / манифестов проекта, иначе `<Command>` для `V-<M>` вывести не из чего.

Он детерминированно проходит `map_pending` (карты модулей), `placeholders` (пустые `V-<M>`), `markup_pending` (`LINKS`) и заканчивается финальными CLI-проверками. Выдуманные команды запрещены: если тест не найден или не проходит — запись остаётся пустой, ставится `Priority: low` и строка в `docs/DRIFT.md`.

6. Вернуться к обычному циклу: `prompts/maintenance/on-before-edit.md` / `on-after-edit.md`. Legacy `docs/` можно заархивировать отдельным решением (бэкап + approval), это не обязательный шаг.

## Если что-то не получилось

| Симптом команды | Что делать (без вопросов пользователю) |
|---|---|
| `status` → `grace_engine.upgrade_required: true` | `npm install -g @osovv/grace-cli@4.2.1` (или `bun add -g ...`), затем повторить `doubled-graph setup --repo .` |
| `setup` → `grace_cli.status: failed`, `error_type: broken_runtime` | Установить рантайм: Bun (`brew install bun`) или `tsx` (`npm install -g tsx`), повторить `setup` |
| `setup` → `grace_cli.status: failed`, `error_type: engine_too_old` | Движок остался 3.x: удалить глобальный пакет и поставить пин (`npm uninstall -g @osovv/grace-cli && npm install -g @osovv/grace-cli@4.2.1`), повторить `setup` |
| `lint` → `project.grace3-detected` | `doubled-graph migrate apply --repo .`; если `migration.grace4-present` — `.grace` уже есть, разбирай `doubled-graph lint --repo .` |
| `lint` → `invalid-project` + `issues` | `doubled-graph lint --repo .` печатает коды; правь по порядку (чаще всего `projection.verification.missing-module-coverage`) |
| `lint` → `markup.module-map-missing` | шаг 1 из `01-content-gaps.md` |
| `lint` → `markup.role-map-mode-mismatch` | привести пару к таблице `ROLE`↔`MAP_MODE` (`methodology/artifacts.md § Разметка кода`), повторить lint |
| `setup` сообщает `prompts: skipped` | пакет установлен из исходников без бандла: переустановить из wheel (`pipx reinstall doubled-graph`) |
| `migrate check` → `unsupported` | эти конструкции GRACE 4 не имеет (`UC-*`, `operational-packets.xml`, `waveFollowUp`); они не переносятся, зафиксируй их список в `docs/DRIFT.md` |
| `detect-changes` → `code_without_module` | `01-content-gaps.md` шаг 3 (`LINKS: M-*`); если модуль не определяется — `DRIFT.md` |

## После обновления

- `phase` остаётся `post_migration`; если вернулся в `migration` — `doubled-graph phase set post_migration --reason "upgrade to 2.0 complete"`.
- Артефакты `.grace` — ground-truth; каждая правка кода идёт через `prompts/maintenance/*`.
- Изменения 2.0: `CHANGELOG.md § 2.0.0`.

---

# Промт

```
Я обновляю внедрённую методологию doubled-graph с версии 1.9.x на 2.0 (GRACE 4, артефакты `.grace/`).
Это НЕ миграция с нуля и НЕ новый проект: артефакты и разметка уже есть (в legacy `docs/*.xml`).

Твоя задача — обновить пакет и движок, перенести артефакты в `.grace`, закрыть содержательные
пробелы по реальному коду и тестам. Поведение кода не меняется: только комментарии-якоря и `.grace`.

Шаг 0. Проверь текущее состояние (только чтение):
  doubled-graph status --repo .
  Смотри: grace_engine.detected.version (нужна 4.x), grace_engine.upgrade_required (должно стать false),
  artifacts.project_kind (grace3 → перенос нужен, grace4 → уже перенесено, none → артефактов не было).

Шаг 1. Обнови пакет (выполняет человек, не ИИ):
  pipx upgrade doubled-graph

Шаг 2. Обнови движок и артефакты одной командой:
  doubled-graph setup --repo .
  Он обновит @osovv/grace-cli до 4.2.1, перенесёт legacy docs/*.xml → .grace (legacy НЕ удаляет),
  добавит LINKS: M-* в MODULE_CONTRACT, выровняет ROLE↔MAP_MODE, скопирует prompts/ и methodology/.

Шаг 3. Проверь результат командами (и только по их выводу принимай решения):
  doubled-graph status --repo .        # project_kind = grace4, upgrade_required = false
  doubled-graph migrate check --repo . # map_pending / placeholders / markup_pending / unsupported
  doubled-graph lint --repo .          # summary.errors

Шаг 4. Закрой содержательные пробелы: прочитай
  prompts/upgrade-methodology/01-content-gaps.md
и выполни его шаги 1–5 без вопросов пользователю: все неоднозначности фиксируются в docs/DRIFT.md
и в итоговом отчёте.

Шаг 5. Финальные проверки:
  doubled-graph lint --repo .                        (summary.errors = 0)
  doubled-graph migrate check --repo .               (map_pending и placeholders пусты)
  doubled-graph detect-changes --scope all --repo .  (missing_verification только с записью в DRIFT.md)
  doubled-graph health --repo .                      (нет модулей без V-<M>)
  doubled-graph module health <M-*> --repo .         (критичные модули не blocked)

Правила обработки ошибок (без вопросов пользователю):
  grace_engine.upgrade_required = true → npm install -g @osovv/grace-cli@4.2.1, повтори setup;
  grace_cli.status = failed / broken_runtime → установи Bun или tsx, повтори setup;
  grace_cli.status = failed / engine_too_old → удали глобальный пакет и поставь @osovv/grace-cli@4.2.1;
  lint = project.grace3-detected → doubled-graph migrate apply --repo ., повтори шаги 3–4;
  lint = invalid-project → lint печатает конкретные коды, исправляй по порядку;
  markup.module-map-missing → шаг 1 из 01-content-gaps.md;
  markup.role-map-mode-mismatch → таблица ROLE↔MAP_MODE в methodology/artifacts.md, повтори lint.

Не запускай prompts/migrate-existing-project/* — это другой сценарий (методологии в репозитории не было).
Не удаляй legacy docs/ и не меняй поведение кода.
В конце отдай отчёт в формате из 01-content-gaps.md (MODULE_MAP / V-<M> / LINKS / lint / health / Дальше).
```

## Если ИИ в IDE без tools+MCP

Методология не работает без MCP и tools — см. `methodology/README.md § Предусловия`. Подключи MCP по `methodology/runtime-adapters/` или смени IDE.
