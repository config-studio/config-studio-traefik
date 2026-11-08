# Traefik Dynamic Configuration Plugin for Config Studio

[![Config Studio Plugin](https://img.shields.io/badge/Config%20Studio-Plugin%20v2.0%2B-0284c7)](https://github.com/config-studio/config-studio)
[![Format](https://img.shields.io/badge/package-cspkg%20v1-10b981)](https://github.com/config-studio/config-studio)
[![Tests](https://img.shields.io/badge/tests-10%2F10%20passing-success)](https://github.com/config-studio/config-studio-traefik)

Официальный плагин Config Studio для работы с динамической конфигурацией **Traefik Reverse Proxy** при архитектуре раздельных файлов правил (`Multi-File Directory Provider`, например `/etc/traefik/rules/` или `rules/*.yml`).

---

## 🚀 Возможности

1. **Multi-File Rules Directory Provider**:
   - Автоматическое распознавание раздельных файлов: `mw-*.yml` (Middlewares) и `ser-*.yml` (Сервисы и Маршрутизаторы).
   - Индексирование графа `routers -> middlewares -> services` на лету при открытии и сохранении файлов.

2. **Кросс-файловый IntelliSense и автодополнение (`@file`)**:
   - При вводе в блоке `middlewares:` или `- ` в Monaco Editor плагин автоматически предлагает все middlewares из `mw-*.yml` с постфиксом `@file` и подробной всплывающей документацией (CIDR, тип, настройки).
   - Автодополнение имен сервисов в блоке `service:`.
   - Готовые сниппеты Traefik dynamic configuration.

3. **Go to Definition с подсветкой строки (`openFile(file, { line, highlight: true })`)**:
   - Клик или `F12` на `mw-local-only@file` мгновенно открывает `mw-local-only.yml` и плавно подсвечивает строку объявления импульсной анимацией (`.cs-line-highlight-flash`).
   - Клик на `service:` переходит к определению бэкенда в соответствующем файле.

4. **Матрица правил Traefik (Rules Matrix Modal)**:
   - Обзорная таблица всех маршрутизаторов, доменов (`Host(...)`), EntryPoints, TLS-резолверов, бэкендов и привязанных middlewares.
   - 1-клик переход к любой строке любого файла.
   - Фильтры по поиску, наличию TLS и ошибкам ссылок.
   - Метрики парка правил (количество роутеров, сервисов, активных TLS).

5. **Linter целостности ссылок и коллизий**:
   - Обнаружение битых ссылок на несуществующие middlewares (`UNRESOLVED_MIDDLEWARE`).
   - Обнаружение отсутствующих бэкенд-сервисов (`UNRESOLVED_SERVICE`).
   - Обнаружение коллизий одинаковых `Host(...)` на одном EntryPoint без приоритета (`DUPLICATE_HOST`).

6. **Мастер создания сервисов (New Service Wizard)**:
   - Быстрое создание файлов `ser-<name>.yml` в каталоге правил.
   - Интерактивный выбор существующих в проекте middlewares через чекбоксы.
   - Живой предпросмотр генерируемого YAML.
   - Автоматическое создание файла, обновление дерева файлов и открытие в редакторе.

7. **Иерархический YAML Outline**:
   - Дерево структуры в боковой панели Config Studio:
     - 🌐 Маршрутизаторы
     - ⚙️ Сервисы
     - 🛡️ Middlewares

---

## 📦 Сборка и упаковка

Сборка бандла:
```bash
npm run build
```

Запуск тестов:
```bash
npm run test:ts
```

Упаковка в `.cspkg`:
```bash
npm run pack
```

---

## 📄 Лицензия

MIT License © 2026 Config Studio Team
