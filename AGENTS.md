# Config Studio Plugin — AI Agent Rules 🚀

## 🛠️ Главные регламенты разработки расширений
1. **One Repo Per Plugin:** Каждый официальный плагин разрабатывается в отдельном самостоятельном GitHub-репозитории со своим кодом, тестами и релизным циклом.
2. **Обязательный релиз плагина через GitHub Workflow (CI/CD Automated Releases):** Каждое расширение должно компилироваться и выпускаться строго через GitHub Actions Workflow (`.github/workflows/release.yml`) при пуше тега версии (`v*`) или `workflow_dispatch`.
   - Автоматическая установка зависимостей (`npm ci`).
   - Запуск unit-тестов (`npm run test:ts` / `npm test`).
   - Сборка бандла (`npm run build`).
   - Упаковка бинарного пакета `.cspkg` (`cspkg pack`).
   - Создание резервного `.zip`.
   - Генерация контрольных сумм SHA-256 (`SHA256SUMS.txt`).
   - Публикация GitHub Release с прикрепленными артефактами (`*.cspkg`, `*.zip`, `SHA256SUMS.txt`).
3. **Инженерная дисциплина (/ub-mode):** *First Make it Work* (TDD, Laziness Protocol, минимальный диф), *Then Make it Right* (устранение первопричин, чистый код), *Follow Practice* (Worktree Cleanup, Keep a Log, Commit often with proof).
4. **Контракт безопасности плагина:** Все манифесты `plugin.json` должны явно декларировать необходимые разрешения (`permissions`), идентификатор, версию, минимальную версию ядра `minCoreVersion` и авторов.

<!-- doubled-graph:phase:start -->
## doubled-graph phase
phase: migration
updated: 2026-11-08
<!-- reason: New official plugin repository onboarding -->
<!-- doubled-graph:phase:end -->
