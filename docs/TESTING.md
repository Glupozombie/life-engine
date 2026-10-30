# Проверки и контроль качества GENESIS

Обновлено: 2026-10-30. Проверки старого LIFE ENGINE (Node simulation, creature-world, ZIP archive) не относятся к текущему GENESIS и удалены из активного набора. Исторические коммиты сохраняются в Git.

## CI

Workflow: `.github/workflows/ci.yml`.

Он содержит два job:
- Python: Python 3.11, установка MuJoCo/Gymnasium/NumPy/pytest, compileall для `genesis/`, запуск pytest.
- Frontend: Node.js 20, npm install, `npm run build`.

Перед тем как считать CI достаточным, проверь последний GitHub Actions run для текущего HEAD. Сам факт наличия workflow не является PASS.

## Локальные Python проверки

Из корня репозитория в активном виртуальном окружении:
```powershell
python -m compileall -q genesis
pytest
```

Дополнительно для smoke test модели и среды (команды/тесты должны быть добавлены и фактически выполнены агентом):
- загрузка `genesis/model/biped.xml` через MuJoCo;
- создание `GenesisBipedEnv(task="stand")`;
- вызов reset и серии step с допустимыми действиями;
- проверка observation shape (33), action shape (11), dtype и finite values;
- проверка reward, terminated/truncated и info;
- несколько random-policy episodes с записью падений, длины эпизодов и reward.

## Локальные frontend проверки

```powershell
npm install
npm run build
npm run dev
```

Известная проблема Windows на 2026-10-30: npm scripts не находят `tsc`/`vite`, хотя прямые команды `.\node_modules\.bin\tsc.cmd --noEmit` и `.\node_modules\.bin\vite.cmd build` проходят. Это не считать исправленным. Полные факты и диагностические команды — в [AI_HANDOFF.md](AI_HANDOFF.md).

Прямой production build был проверен пользователем на Windows:
- TypeScript 5.9.3: `tsc.cmd --noEmit` — без ошибок.
- Vite 6.4.5: `vite.cmd build` — PASS, 27 modules transformed.
- Dev server через прямой `vite.cmd --host 127.0.0.1` стартует.
- Firefox UI rendering — пока не подтверждён; пользователь сообщал о пустой странице и warning, содержащем `file:///`.

## Обязательный ручной end-to-end smoke test

- [ ] Backend стартует и остаётся активным на 127.0.0.1:8000.
- [ ] `/docs` открывает FastAPI API docs.
- [ ] Frontend стартует на 127.0.0.1:5173.
- [ ] Страница GENESIS отображается без JS ошибок.
- [ ] WebSocket `/ws/telemetry` подключается и получает snapshot.
- [ ] Кнопка обучения отправляет POST `/api/train`.
- [ ] Во время обучения растёт step counter.
- [ ] Отображается тело из MuJoCo render state.
- [ ] Отображаются активации и веса той actor policy, которая реально управляет телом.
- [ ] Stop останавливает обучение без зависшего потока.
- [ ] Ошибка backend отображается в UI, а не теряется молча.

## Качество обучения — отдельная проверка

Сборка UI и успешный запуск сервера не доказывают, что агент чему-либо научился. Для stand/recovery фиксировать:
- seed и полную конфигурацию;
- baseline random/no-op;
- episode reward и его компоненты;
- долю времени в вертикальном положении;
- длительность до падения / fall rate;
- угловую скорость и наклон корпуса;
- разброс результатов на нескольких seeds;
- checkpoint и способ повторной оценки сохранённой policy.

Не объявлять этап успешным по одному красивому эпизоду или только по росту reward.

## Шаблон отчёта

```text
Дата / ОС / версии:
Commit:
Команда или сценарий:
Результат: PASS / FAIL / BLOCKED / NOT VERIFIED
Вывод:
Что это доказывает:
Что остаётся непроверенным:
```
