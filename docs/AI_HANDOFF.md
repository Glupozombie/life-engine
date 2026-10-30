# GENESIS — единая передача проекта ИИ-агенту

> Канонический документ передачи контекста. Проверяй код и GitHub заново перед каждым изменением: этот файл — карта, а не замена аудиту.

**Репозиторий:** https://github.com/Glupozombie/life-engine  
**Основная ветка:** `main`  
**Аудированный снимок актуального дерева до документальной синхронизации:** `bc45c803e757cdac2df98fa80556348cea3b524f`  
**Дата фиксации контекста:** 2026-10-30

## 1. Что такое GENESIS

GENESIS (Embodied Learning Lab) — локальная интерактивная исследовательская лаборатория воплощённого обучения. В ней физическое двуногое тело в симуляторе MuJoCo управляется нейросетевой политикой. Политика получает наблюдения от тела, выдаёт управляющие воздействия суставам, а затем получает новые наблюдения и награду. PPO постепенно оптимизирует политику на основе взаимодействия с физической средой.

Пользователь должен видеть одновременно:
- физическое тело и его реальное движение, падения и контакты;
- фактическую управляющую нейросеть, которая влияет на суставы;
- настоящие активации слоёв и веса из actor-сети Stable-Baselines3;
- состояние обучения, шаги и измеримые метрики.

**Не цель:** изображать сознание, мысли, эмоции или человеческий интеллект. Активации — численные вычислительные состояния сети. Не выдавать визуальную анимацию за физическое управление.

### Текущий продуктовый этап

Первый вертикальный срез — эксперимент управления телом в задаче `stand`: восстановление/удержание вертикального положения и контроль тела. Это НЕ готовая ходьба. В коде среды предусмотрены названия задач `stand`, `walk`, `run`, но это само по себе не доказывает, что ходьба и бег обучаются успешно. UI сейчас отправляет задачу `stand`.

Будущая последовательность после проверенного базового контроля: устойчивый баланс → контролируемое восстановление из разных начальных поз → первые шаги → ходьба → бег → эксперименты с эволюцией топологии. Не перескакивать через измеримые этапы.

## 2. Технологический стек

- Python 3.11 — backend и обучение.
- MuJoCo 3.x — физическая симуляция тела, суставов и контактов.
- Gymnasium — API среды RL.
- PyTorch + Stable-Baselines3 PPO — политика и обучение.
- FastAPI + Uvicorn — HTTP API.
- WebSocket — телеметрия в браузер.
- React 18 + TypeScript + Vite — интерфейс.
- Canvas 2D — отрисовка тела и нейросети.

Обучение и симуляция локальные. Не добавлять облачные API и обязательные платные сервисы без явной необходимости.

## 3. Структура репозитория и что читать

Начинай с:
1. `AGENTS.md` — общие правила для любого агента.
2. `CLAUDE.md` — короткие инструкции Claude.
3. `docs/AI_HANDOFF.md` — этот полный контекст.
4. `docs/CURRENT_STATE.md` — актуальный статус и проверенные/непроверенные факты.
5. `docs/ROADMAP.md` — приоритеты.
6. `docs/ARCHITECTURE.md` — потоки данных и архитектура.
7. `docs/INSTALL.md` — установка и запуск.
8. `docs/TESTING.md` — проверки и тестовые сценарии.
9. `docs/DECISIONS.md` — зафиксированные решения.
10. `docs/SESSION_HANDOFF.md` — последняя передача сессии; сверяй дату и актуальность.

Далее читай только затрагиваемые исходники. Не перечитывай все документы при каждой мелкой задаче.

### Карта исходников

| Путь | Назначение |
|---|---|
| `genesis/model/biped.xml` | MuJoCo XML-модель тела, геометрия, суставы, actuators, контакты |
| `genesis/env.py` | Gymnasium-среда, reset/step, observation/action spaces, reward, termination, render state |
| `genesis/train.py` | CLI-обучение PPO и сохранение модели |
| `genesis/callbacks.py` | Callback обучения, сбор телеметрии и публикация snapshot |
| `genesis/telemetry.py` | Извлечение реальных активаций и весов actor-сети SB3 |
| `genesis/server.py` | FastAPI endpoints, управление обучением, WebSocket |
| `genesis/__init__.py` | Пакет |
| `src/App.tsx` | React UI, управление запуском, WebSocket, Canvas |
| `src/main.tsx` | Точка входа React |
| `src/styles.css` | Стили |
| `index.html` | HTML entry point |
| `vite.config.ts` | Конфигурация Vite |
| `tsconfig.json` | TypeScript |
| `package.json` | npm scripts и frontend dependencies |
| `requirements.txt` | Python dependencies |
| `pyproject.toml` | pytest и Ruff configuration |
| `.github/workflows/ci.yml` | CI: Python checks и frontend build |
| `tests/test_env.py` | Тесты среды |

### Поток данных

1. UI вызывает `POST /api/train`.
2. FastAPI запускает training worker в отдельном потоке.
3. Worker создаёт Gymnasium env через SB3 vector env и PPO policy.
4. PPO выдаёт actions, которые записываются в MuJoCo controls; MuJoCo рассчитывает физический шаг.
5. Callback периодически извлекает observation, тело, actor activations, weights и метрики.
6. `publish_snapshot` сохраняет последний snapshot.
7. WebSocket `/ws/telemetry` отправляет snapshot UI.
8. React Canvas рисует физическое тело и сеть.

Проверяй этот поток по коду перед изменением протокола. Не создавай вторую параллельную систему телеметрии без причины.

## 4. Известная реализация (по исходникам)

- `GenesisBipedEnv` использует MuJoCo XML `genesis/model/biped.xml`.
- В `env.py` заданы `ACTION_SIZE = 11` и `OBSERVATION_SIZE = 33`.
- Observation собирается из 14 qpos, 14 qvel, 4 контактных признаков и target speed.
- Action space — 11 непрерывных значений в диапазоне [-1, 1].
- `reset()` случайно задаёт начальный угол и небольшие возмущения суставов/скоростей.
- Reward для `stand` ориентирован на вертикальность и штраф за излишнюю динамику/управление. Для `walk`/`run` в коде есть целевая скорость, но качество этих режимов не подтверждено.
- PPO MLP actor/critic: [128, 128], параметры обучения находятся в `genesis/train.py` и `genesis/server.py`.
- UI в текущем коде запускает `task: "stand"`, по умолчанию 500 000 timesteps и 2 envs.
- UI использует `ws://127.0.0.1:8000/ws/telemetry`, POST `/api/train`, POST `/api/stop`.
- `GET /` backend не обязан обслуживать: интерфейс Vite работает отдельно на порту 5173. Для API документации используй `http://127.0.0.1:8000/docs`, если FastAPI docs включены.

## 5. Текущее состояние запуска на Windows 10

Рабочая папка пользователя: `E:\Personal stuff\life-engine`.

Подтверждено в локальном окружении пользователя (2026-10-30):
- Node.js установлен; npm сообщает версию `11.20.0`.
- `npm install` завершился успешно: 71 packages added, 0 vulnerabilities.
- npm сообщил о необходимости одобрить install script `esbuild@0.25.12`; пользователь выполнил `npm install-scripts approve esbuild`, после чего npm сообщил `Approved esbuild`.
- `npm ls typescript` показал `typescript@5.9.3`.
- `.\node_modules\.bin\tsc.cmd --version` → Version 5.9.3.
- `.\node_modules\.bin\tsc.cmd --noEmit` завершилась без ошибок.
- `.\node_modules\.bin\vite.cmd build` успешно собрала production bundle: 27 modules, CSS 4.72 kB, JS 153.23 kB, build 1.79 s.
- Прямая команда `.\node_modules\.bin\vite.cmd --host 127.0.0.1` запускает Vite 6.4.5 на `http://127.0.0.1:5173/`.
- Backend ранее успешно стартовал командой `python -m uvicorn genesis.server:app --host 127.0.0.1 --port 8000`; лог сообщал Application startup complete.
- Открытие `http://127.0.0.1:8000/` даёт ожидаемый JSON `{"detail":"Not Found"}` и HTTP 404, потому что корневой HTML frontend обслуживает Vite, а backend — API.

### Незакрытые Windows-проблемы

**Проблема A — npm scripts не находят локальные бинарники.**
- `npm run build` падает с `'tsc' is not recognized as an internal or external command`.
- Прямой `tsc.cmd --noEmit` проходит.
- Прямой `vite.cmd build` проходит.
- Добавление `$env:Path = "$(Get-Location)\node_modules\.bin;$env:Path"` перед `npm run build` не помогло.
- Ранее `npm run dev` аналогично падал: `'vite' is not recognized`, хотя `node_modules\.bin\vite.cmd` существует и прямой запуск работает.
- Причина пока НЕ установлена. Не утверждать, что это проблема пакетов: прямые бинарники работают. Диагностировать npm script shell, `ComSpec`, npm config `script-shell`, PATH внутри npm lifecycle, PowerShell/cmd configuration, shim files и возможные переменные окружения. Не переустанавливать Node/npm и не удалять lockfile/node_modules без доказанной причины.
- Диагностика, уже запрошенная, но ещё не полученная: `npm config get script-shell`, `$env:ComSpec`, `cmd /d /c "where tsc"`, `npm run env | Select-String "PATH="`.

**Проблема B — пустая страница в Firefox.**
- При открытии `http://127.0.0.1:5173` пользователь видел пустую страницу.
- В Console замечено: `[vite] connecting...`, `[vite] connected.`, затем `Security Error: Content at http://127.0.0.1:5173/ may not load or link to file:///.`
- По проверенным файлам `index.html`, `vite.config.ts`, `src/main.tsx`, `src/App.tsx`, `src/styles.css` очевидной ссылки на `file://` не найдено.
- Причина пустой страницы не установлена. Сообщение может быть от расширения/инъекции браузера, но это лишь гипотеза. Не объявлять проблему решённой и не обвинять расширение без проверки.
- Следующий шаг: получить все ошибки Console (особенно Uncaught/TypeError/Failed to load module), вкладку Network для `main.tsx`, `App.tsx`, CSS и проверить HTTP-ответы. Проверить также `http://127.0.0.1:5173/src/main.tsx` и `/src/App.tsx`. Убедиться, что локальный checkout соответствует текущему `main` и нет устаревших файлов/не той ветки. Не закрывать уже запущенные процессы до завершения диагностики.

**Статус:** TypeScript typecheck и Vite production build подтверждены прямым запуском. Запуск через npm scripts и визуальный рендер в Firefox пока НЕ подтверждены.

## 6. Команды запуска и проверки

### Windows PowerShell — backend
Из корня репозитория:
```powershell
py -3.11 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
pip install -r requirements.txt
python -m uvicorn genesis.server:app --host 127.0.0.1 --port 8000
```

### Windows PowerShell — frontend
```powershell
npm install
npm run dev
```
Если npm scripts всё ещё не работают, диагностировать причину. Временный обходной путь, уже подтверждённый для Vite:
```powershell
.\node_modules\.bin\vite.cmd --host 127.0.0.1
```
Production build прямым запуском:
```powershell
.\node_modules\.bin\tsc.cmd --noEmit
.\node_modules\.bin\vite.cmd build
```
Не выдавать эти обходные команды за исправление npm.

### Python checks
```powershell
python -m compileall -q genesis
pytest
```

### URLs
- Frontend: `http://127.0.0.1:5173/`
- Backend API docs: `http://127.0.0.1:8000/docs`
- Backend status: проверь реализацию endpoint в `genesis/server.py`; текущий UI использует WebSocket.

## 7. Что уже сделано в GitHub

- PR #7 — переход от прежнего LIFE ENGINE к GENESIS, squash-merged в `main`; SHA, записанный в истории проекта: `033fc20494be8804c52f51ded830b0c618751533`.
- PR #8 — добавлена инструкция установки `docs/INSTALL.md`, squash-merged в `main`; SHA: `06f56506d9ba274fe17fb21d0349e3010f630345`.
- На текущем дереве `main` есть физическая модель, Gymnasium env, PPO training, FastAPI/WebSocket, React UI, CI и документация.
- PR #5 и #6 относятся к старому продукту LIFE ENGINE/экосистеме и не должны считаться текущим функционалом GENESIS.

## 8. Что ещё не доказано / не реализовано

Не утверждать, что:
- персонаж успешно научился вставать, стоять или ходить;
- обучение стабильно сходится на разных seed;
- reward действительно коррелирует с полезным навыком;
- модель физически корректна во всех позах и не имеет скрытых проблем контактов;
- UI корректно отображает тело и нейросеть во время реального обучения;
- checkpoint можно безопасно загрузить/продолжить обучение;
- остановка обучения корректно закрывает все env и потоки;
- телеметрия не создаёт существенной нагрузки;
- `walk` или `run` освоены;
- CI подтверждает реальное качество обучения.

Отдельно проверить: тесты `tests/test_env.py`, актуальность CI dependency installation, reset/step API Gymnasium, размеры observation/action, физические ограничения модели, корректность определения падения, reward decomposition, vectorized env telemetry, thread lifecycle, ошибки training worker, checkpointing/resume, CORS/localhost, WebSocket reconnect, canvas resize/devicePixelRatio.

## 9. Приоритетный план работ

### P0 — восстановить воспроизводимый локальный запуск
1. Проверить локальную ветку, commit и соответствие файлов GitHub `main`.
2. Установить причину, почему `npm run` не видит `tsc`/ `vite`, несмотря на рабочие shims.
3. Получить настоящую ошибку браузерного рендера из Console/Network.
4. Добиться одновременного запуска backend и frontend и отображения UI.
5. Записать точные команды и проверенные результаты в docs.

### P1 — проверить физическую среду
1. Запустить unit tests и smoke test MuJoCo model load.
2. Проверить action/observation shapes, dtype, finite values, reward, terminated/truncated.
3. Запустить random-policy episodes и измерить падения/стабильность/NaN.
4. Проверить начальные положения, геометрию, контакты ног и масштаб модели.
5. Добавить диагностические метрики по компонентам reward и эпизодам.

### P2 — доказать обучение stand
1. Запустить короткие baseline runs с фиксированными seeds.
2. Сравнивать с random/no-op baseline.
3. Сохранять TensorBoard/logs и checkpoints с конфигурацией.
4. Оценивать upright duration, fall rate, episode length, reward components и variance across seeds.
5. Не менять много reward коэффициентов одновременно; каждый эксперимент фиксировать.

### P3 — связать симуляцию с UI
1. Подтвердить WebSocket snapshots на реальном обучении.
2. Исправить lifecycle старта/остановки/ошибок.
3. Проверить body coordinates, pitch, velocity и обновление Canvas.
4. Проверить brain activations/weights соответствуют реально используемой actor policy.
5. Сделать UI понятным при disconnected/starting/training/completed/error.

### P4 — сохранить воспроизводимость
- Надёжное сохранение и продолжение PPO checkpoint.
- Конфиг эксперимента и seed.
- История результатов нескольких запусков.
- Сравнение версий политик.
- После этого — curriculum и новые моторные навыки.

### P5 — исследовательское расширение
- Ходьба/бег после устойчивого stand/recovery baseline.
- NEAT-подобная эволюция topology — отдельный эксперимент, сравниваемый с PPO baseline, а не подмена существующей политики без оценки.

## 10. Правила работы ИИ-агента

- Сначала читай текущий код, затем документацию; если они расходятся, код показывает фактическое поведение, а документация должна быть исправлена.
- Не переписывай проект с нуля и не меняй стек без конкретной технической причины.
- Не делай крупный рефакторинг одновременно с исправлением запуска.
- Сначала воспроизведи ошибку минимальной командой. Исправляй первопричину, а не маскируй её.
- Не устанавливай зависимости и не меняй версии без необходимости. Сверяй `package.json`, lockfile (если существует), `requirements.txt` и CI.
- Не удаляй данные, архивы, workflow, tests или docs без проверки ссылок и роли. Не удаляй пользовательские checkpoints/logs.
- Все изменения — в отдельной ветке с небольшими логическими коммитами и PR в `main`, если среда это поддерживает. Не force-push в `main`.
- Перед завершением запусти релевантные проверки и сообщи точные команды/выводы. Если запуск недоступен — явно BLOCKED, не выдумывай PASS.
- Обновляй `docs/CURRENT_STATE.md`, `docs/TESTING.md`, `docs/CHANGELOG.md`, `docs/SESSION_HANDOFF.md` по мере необходимости. Handoff должен сохранять точную точку остановки.
- Не трать токены на пересказ всего проекта в каждом ответе. В начале сессии прочитай документы один раз; дальше веди короткий журнал изменений и ссылайся на пути/коммиты.
- Вопросы пользователю задавай только если без ответа невозможно безопасно продолжить. Не спрашивай повторно то, что уже записано здесь.

## 11. Формат отчёта после каждой рабочей сессии

1. **Изменено:** файлы и причина.
2. **Проверено:** точные команды и результаты.
3. **Не проверено / BLOCKED:** что и почему.
4. **Остаточные проблемы:** только реальные.
5. **Следующий шаг:** максимум три конкретных действия.
6. **Git:** ветка, commit SHA, PR URL (если создан).
7. **Документация:** какие документы синхронизированы.

Главный критерий успеха — не количество написанного кода и не красивый dashboard, а воспроизводимое физическое обучение с измеримым улучшением моторного поведения.
