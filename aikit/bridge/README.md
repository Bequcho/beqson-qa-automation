# aiKit QA Bridge — бесплатное управление QA из обычного чата

Bridge запускается на Windows-компьютере пользователя и читает задачи из PRIVATE GitHub issue queue Bequcho/beqson-qa-platform. Он принимает только три фиксированные команды. Персональные cookies, файлы профиля и приватные отчеты никогда не отправляются в GitHub.

## Установка один раз (PowerShell)

```powershell
git clone --branch feature/aikit-round2-free-qa https://github.com/Bequcho/beqson-qa-automation.git
cd beqson-qa-automation
npm ci
npx playwright install chromium
gh auth login --hostname github.com --scopes repo
```

Если gh отсутствует: winget install --id GitHub.cli; затем перезапустите PowerShell. В GitHub входите под Bequcho, у которого есть доступ к приватному репозиторию beqson-qa-platform.

## Запуск непрерывного Bridge

```powershell
node aikit/bridge/watch.mjs
```

Bridge опрашивает приватную очередь каждые 30 секунд. Остановить Ctrl+C. ChatGPT через подключенный GitHub может создать issue нужного формата, а агент выполнит тест автоматически, не тратя кредиты сторонних браузерных сервисов.

Команды: PUBLIC_REMAINING (последние 5 языков), PUBLIC_ALL (все 28), AUTH_SMOKE (проверка авторизованного проекта).

## Одноразовый вход в aiKit — локально

Остановить Bridge, затем выполнить:

```powershell
node aikit/bridge/setup-auth.mjs
```

В отдельном браузере Playwright войти в aiKit вручную, затем вернуться в PowerShell и нажать Enter. Секреты не отправлять в чат. Данные сохраняются в .aikit-local/chrome-profile, папка исключена из Git. Затем снова запускать watch.mjs.

## Где результаты

- aikit-qa-results/report.json и report.md — публичные проверки
- .aikit-local/auth-smoke.json — закрытый результат входа
- .aikit-local/bridge-state.json — защита от повторного запуска задач

В приватном GitHub issue публикуются только счетчики проверок и статус, без пользовательских данных. Запросы от посторонних аккаунтов игнорируются. Произвольный код из issue никогда не исполняется.

## Область покрытия и ограничения

99 официальных пунктов aiKit Round 2 по девяти карточкам требуют отдельных сценариев. Этот первый Bridge полностью автоматизирует только публичные языковые smoke checks и проверку доступа в кабинет. Создание сайтов, генерация аудио, взаимодействия с приватными модулями и изменение данных не запускаются без отдельного разрешения.

Сохраненный рабочий лог 13 ноября 2026 года содержит 3 PASS, 3 FAIL, 93 NOT TESTED. Это старый чекпоинт, его нужно сверить с текущим Team Program. Никаких дополнительных PASS без фактически проведенной проверки.
