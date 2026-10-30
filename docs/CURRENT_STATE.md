# Текущее состояние GENESIS

Обновлено: 2026-10-30. Подробный контекст: [AI_HANDOFF.md](AI_HANDOFF.md). Этот файл — краткая актуальная карта, не исторический changelog.

## Идентичность проекта
GENESIS — локальная лаборатория воплощённого обучения. MuJoCo biped управляется PPO policy; FastAPI/WebSocket передаёт телеметрию; React/Canvas отображает тело и реальные параметры actor-сети. Первый этап — stand/recovery, а не освоенная ходьба.

## Репозиторий
- Repo: https://github.com/Glupozombie/life-engine
- Branch: `main`
- HEAD на момент обновления: `06f56506d9ba274fe17fb21d0349e3010f630345`
- Последние функциональные изменения: PR #7 — переход на GENESIS; PR #8 — инструкция установки.
- Основные каталоги: `genesis/`, `src/`, `docs/`, `tests/`, `.github/workflows/`.

## Реальная структура
- `genesis/model/biped.xml` — MuJoCo-модель.
- `genesis/env.py` — Gymnasium env, action/observation/reward.
- `genesis/train.py` — CLI PPO training.
- `genesis/callbacks.py` и `genesis/telemetry.py` — сбор реальных активаций/весов и snapshot.
- `genesis/server.py` — FastAPI, train/stop/status, WebSocket.
- `src/App.tsx`, `src/main.tsx`, `src/styles.css` — React интерфейс и Canvas.
- `package.json`, `requirements.txt`, `pyproject.toml` — зависимости и настройки.
- `.github/workflows/ci.yml` — Python и frontend CI.
- `tests/test_env.py` — тест среды.

## Подтверждено локально на Windows 10 (2026-10-30)
- `npm install` завершился успешно (71 packages added, 0 vulnerabilities).
- `npm ls typescript` → TypeScript 5.9.3.
- `.\node_modules\.bin\tsc.cmd --noEmit` — PASS.
- `.\node_modules\.bin\vite.cmd build` — PASS; Vite 6.4.5, 27 modules transformed.
- Прямой запуск `.\node_modules\.bin\vite.cmd --host 127.0.0.1` поднимает dev server на 127.0.0.1:5173.
- Backend ранее успешно запускался через `python -m uvicorn genesis.server:app --host 127.0.0.1 --port 8000`.
- `GET /` на backend даёт 404 Not Found — ожидаемо: backend не является frontend.

## Открытые проблемы
1. **npm lifecycle scripts:** `npm run build` не находит `tsc`, `npm run dev` не находит `vite`, хотя соответствующие `.cmd` файлы существуют и работают напрямую. Добавление `node_modules\.bin` в PATH вручную не помогло. Причина не установлена. Не переустанавливать Node/npm или зависимости без диагностики. См. раздел Windows в [AI_HANDOFF.md](AI_HANDOFF.md).
2. **Firefox blank page:** Vite подключается, но UI не отображается. В Console было сообщение о запрете загрузки/ссылки на `file:///`; точная причина не установлена. Нужны все JS Console errors и Network responses. Не считать сообщение доказанной причиной.
3. **Обучение:** успешное обучение stand не подтверждено метриками на нескольких seed.
4. **Физическая корректность:** нужна проверка random-policy episodes, контактов, reward, падений и NaN.
5. **Frontend integration:** WebSocket/Canvas во время настоящего обучения ещё не подтверждены end-to-end.
6. **Checkpoint/resume и lifecycle остановки:** требуется отдельная проверка.

## Статус по компонентам

| Компонент | Статус |
|---|---|
| Python package / MuJoCo model / Gymnasium env | Реализация в репозитории; полноценная физическая валидация ещё нужна |
| PPO training | Реализация есть; сходимость и качество навыка не доказаны |
| FastAPI + WebSocket | Сервер стартовал локально; полный UI round-trip не подтверждён |
| React/Vite frontend | Прямой production build PASS; dev server стартует напрямую; браузерный рендер не подтверждён |
| Реальные actor activations/weights | Экстрактор реализован; соответствие во время живого обучения нужно проверить |
| CI | Workflow присутствует; свежий успешный run после GENESIS должен быть проверен |
| Walking/running | Не считать освоенными или валидированными |

## Следующий шаг
P0: исправить npm scripts и выяснить первопричину пустой страницы Firefox. Затем выполнить физический smoke-test и короткий воспроизводимый stand baseline.