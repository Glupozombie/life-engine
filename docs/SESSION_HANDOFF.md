# Передача рабочей сессии — GENESIS

Обновлено: 2026-10-30

Подробный контекст, структура, команды и план: [AI_HANDOFF.md](AI_HANDOFF.md). Этот файл содержит только последнюю точку остановки.

## Текущий фокус
P0: устранить проблемы локального запуска GENESIS на Windows 10. Не заниматься новыми функциями до воспроизводимого запуска frontend + backend.

## Репозиторий
- https://github.com/Glupozombie/life-engine
- Ветка: `main`
- Аудированный снимок актуального дерева перед синхронизацией документации: `bc45c803e757cdac2df98fa80556348cea3b524f`
- Рабочая папка пользователя: `E:\Personal stuff\life-engine`

## Уже проверено пользователем
- `npm install` — завершился успешно, 71 packages added, 0 vulnerabilities.
- `npm install-scripts approve esbuild` — сообщил `Approved esbuild`; повторный npm install прошёл.
- `npm ls typescript` — TypeScript 5.9.3.
- `.\node_modules\.bin\tsc.cmd --version` — Version 5.9.3.
- `.\node_modules\.bin\tsc.cmd --noEmit` — завершилась без ошибок.
- `.\node_modules\.bin\vite.cmd build` — PASS, Vite 6.4.5, 27 modules transformed.
- `.\node_modules\.bin\vite.cmd --host 127.0.0.1` — dev server запускается на 127.0.0.1:5173.
- Backend запускался через `python -m uvicorn genesis.server:app --host 127.0.0.1 --port 8000`; startup complete.
- `http://127.0.0.1:8000/` возвращает 404 Not Found — это ожидаемо, frontend на 5173, backend API на 8000.

## Ошибки, ещё не решённые

### 1. npm run не находит tsc/vite
- `npm run build` → `'tsc' is not recognized as an internal or external command`.
- `npm run dev` ранее → `'vite' is not recognized...`.
- При этом `node_modules\.bin\tsc.cmd` и `vite.cmd` существуют и работают напрямую.
- Ручное добавление `$(Get-Location)\node_modules\.bin` в `$env:Path` не помогло.
- Причина не установлена. Не предлагать повторную установку Node/npm и не удалять node_modules без диагностики.

Следующие команды для диагностики:
```powershell
npm config get script-shell
$env:ComSpec
cmd /d /c "where tsc"
npm run env | Select-String "PATH="
```
Нужно проверить PATH именно внутри npm lifecycle, shell config и cmd shim resolution.

### 2. Пустая страница Firefox
- На `http://127.0.0.1:5173/` пользователь видит пустую страницу.
- Console показывала Vite connected и сообщение:
  `Security Error: Content at http://127.0.0.1:5173/ may not load or link to file:///.`
- Точная причина не найдена. Не утверждать, что виновато расширение, пока нет доказательств.
- Следующий шаг: запросить полный список красных ошибок Console и Network для `/src/main.tsx`, `/src/App.tsx`, CSS. Проверить HTTP responses и локальную ветку/checkout.

## Текущий статус
- TypeScript typecheck: PASS при прямом запуске.
- Vite production build: PASS при прямом запуске.
- Vite dev server: запускается прямым `vite.cmd`.
- `npm run dev/build`: FAIL из-за неразрешённого PATH/script-shell поведения.
- Browser rendering: BLOCKED / причина не установлена.
- End-to-end обучение и визуализация: NOT VERIFIED.
- Успешное освоение stand/walk/run: NOT CLAIMED.

## Следующий агент — порядок действий
1. Не вноси кодовые изменения наугад. Сначала получи вывод четырёх диагностических команд npm lifecycle выше.
2. Получи реальные Console/Network ошибки Firefox; проверь `http://127.0.0.1:5173/src/main.tsx` и `/src/App.tsx`.
3. Устрани первопричину минимальным изменением и проверь npm scripts.
4. После появления UI запусти backend, проверь WebSocket и короткий stand training smoke test.
5. Обнови этот handoff и CURRENT_STATE только фактическими результатами.

Не трать токены на повторный пересказ проекта. Полная карта уже в `docs/AI_HANDOFF.md`.