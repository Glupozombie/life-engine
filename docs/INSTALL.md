# Установка и запуск GENESIS

Полная инструкция для Windows 10/11 и популярных дистрибутивов Linux. Здесь описан запуск текущего прототипа GENESIS: физическая среда MuJoCo, обучение PPO и веб-интерфейс.

> **Важно:** для текущей версии проекта используй Python 3.11 (рекомендуемая и целевая версия) и Node.js 20 или новее. Устанавливай Python именно в виртуальное окружение проекта. Не смешивай зависимости GENESIS с системным Python.

## 1. Что потребуется

| Компонент | Версия | Для чего |
|---|---:|---|
| Git | актуальная | Получить исходный код |
| Python | **3.11.x** | Симуляция, API и обучение |
| pip | актуальная | Python-зависимости |
| Node.js | **20+ LTS** | Сборка и запуск интерфейса |
| npm | поставляется с Node.js | Frontend-зависимости |

Рекомендуется 8 ГБ ОЗУ или больше. Обучение может работать на CPU, но скорость зависит от процессора. NVIDIA GPU не является обязательным условием запуска. На первом запуске PyTorch может скачать довольно крупные пакеты.

## 2. Получение проекта

Если Git ещё не установлен, установи его с официального сайта: https://git-scm.com/downloads

Открой терминал в папке, где хочешь хранить проект:

```bash
git clone https://github.com/Glupozombie/life-engine.git
cd life-engine
```

Если репозиторий уже скачан, перейди в его каталог. Все дальнейшие команды выполняй из корня проекта — там, где находятся `requirements.txt` и `package.json`.

---

# Windows 10 и Windows 11

## 3. Установка Python 3.11

### Вариант A — через Python Launcher

Открой PowerShell и выполни:

```powershell
py install 3.11
```

После установки проверь, что интерпретатор появился:

```powershell
py -0p
py -3.11 --version
```

Ожидаемый результат второй команды — версия вида `Python 3.11.x`.

### Вариант B — через официальный установщик

1. Открой https://www.python.org/downloads/release/python-3119/ или страницу актуального выпуска Python 3.11.
2. Скачай Windows installer (64-bit).
3. Запусти установщик. Включи **Add python.exe to PATH**.
4. Заверши установку и открой новое окно PowerShell.
5. Проверь:

```powershell
py -3.11 --version
```

Если команда `py` не найдена, переустанови Python с Python Launcher либо используй полный путь к `python.exe`.

## 4. Установка Node.js

Скачай LTS-версию с https://nodejs.org/ и установи её с настройками по умолчанию. После установки открой новое окно PowerShell:

```powershell
node --version
npm --version
```

Версия Node должна быть 20 или новее.

Альтернатива через Windows Package Manager:

```powershell
winget install --id OpenJS.NodeJS.LTS -e
```

После установки открой новый терминал.

## 5. Установка backend

Перейди в корень репозитория. Создай виртуальное окружение:

```powershell
py -3.11 -m venv .venv
```

Активируй его:

```powershell
.\.venv\Scripts\Activate.ps1
```

Если PowerShell запрещает запуск скриптов, разреши их только для текущего окна:

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
.\.venv\Scripts\Activate.ps1
```

Установи зависимости:

```powershell
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
```

Проверь, что используется именно виртуальное окружение:

```powershell
python --version
python -c "import sys; print(sys.executable)"
```

В пути к исполняемому файлу должно присутствовать `.venv`.

## 6. Установка frontend

Открой **второе** окно PowerShell, перейди в корень репозитория и выполни:

```powershell
npm install
```

## 7. Запуск GENESIS

**Терминал 1 — backend:**

```powershell
.\.venv\Scripts\Activate.ps1
python -m uvicorn genesis.server:app --host 127.0.0.1 --port 8000
```

**Терминал 2 — frontend:**

```powershell
npm run dev
```

Открой адрес, который напечатает Vite. Обычно это:

http://127.0.0.1:5173

Оставь оба терминала открытыми. Для остановки нажми `Ctrl+C` в соответствующем терминале.

### Windows: запуск из папки с пробелами

Путь вроде `E:\Personal stuff\life-engine` допустим. В PowerShell сначала перейди в него с кавычками:

```powershell
Set-Location "E:\Personal stuff\life-engine"
```

Само виртуальное окружение и команды запуска не требуют переноса проекта в папку без пробелов.

---

# Linux

Инструкция подходит для Ubuntu, Debian, Linux Mint, Pop!_OS, Fedora, Arch Linux, EndeavourOS, Manjaro и openSUSE. Команды установки системных пакетов отличаются; команды создания окружения и запуска после этого одинаковые.

## 8. Системные пакеты

### Ubuntu / Debian / Linux Mint / Pop!_OS

```bash
sudo apt update
sudo apt install -y git curl build-essential python3 python3-venv python3-pip
```

В разных выпусках Ubuntu и Debian системный Python может быть не 3.11. Не пытайся насильно заменить системный Python: установи отдельный Python 3.11 через uv (раздел 9).

Для библиотек, которые могут понадобиться графическим и headless-компонентам MuJoCo:

```bash
sudo apt install -y libgl1 libegl1 libosmesa6 libglib2.0-0
```

Если пакет не найден в конкретном выпуске дистрибутива, пропусти его и сначала проверь обычный запуск. Не все режимы рендеринга требуют весь этот набор.

### Fedora

```bash
sudo dnf install -y git curl gcc gcc-c++ make python3 python3-pip
```

Можно попробовать установить Python 3.11 из репозиториев:

```bash
sudo dnf install -y python3.11
```

Если пакет недоступен, используй uv из следующего раздела.

### Arch Linux / EndeavourOS / Manjaro

```bash
sudo pacman -Syu --needed git curl base-devel python python-pip
```

Не заменяй системный Python сторонней версией. Для отдельного Python 3.11 используй uv.

### openSUSE Leap / Tumbleweed

```bash
sudo zypper refresh
sudo zypper install -y git curl gcc gcc-c++ make python3 python3-pip
```

Если в репозиториях доступен отдельный пакет Python 3.11, его можно установить через zypper. В противном случае используй uv.

## 9. Установка Python 3.11 на Linux через uv

Этот способ позволяет получить отдельный Python, не меняя системный интерпретатор. Он подходит, если в репозитории дистрибутива нет Python 3.11 или установлен другой релиз.

Установи uv:

```bash
curl -LsSf https://astral.sh/uv/install.sh | sh
```

Закрой и заново открой терминал. Если команда `uv` не найдена, выполни команду, которую напечатал установщик, или добавь каталог установки uv в PATH.

Установи Python 3.11:

```bash
uv python install 3.11
uv python find 3.11
```

В качестве альтернативы можно использовать системный пакет Python 3.11, если он доступен. Важно, чтобы команда `python3.11 --version` показывала Python 3.11.x.

## 10. Установка Node.js на Linux

Рекомендуется Node.js 20 LTS или новее. Универсальный вариант для разных дистрибутивов — nvm (менеджер версий Node.js):

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash
```

Закрой и снова открой терминал. Установи и активируй LTS:

```bash
nvm install 20
nvm use 20
node --version
npm --version
```

Если команда `nvm` не найдена, перечитай файл конфигурации оболочки (обычно `source ~/.bashrc` для Bash или `source ~/.zshrc` для Zsh), затем повтори проверку.

## 11. Создание окружения и установка зависимостей

Перейди в корень проекта. Если Python 3.11 установлен как системный пакет:

```bash
python3.11 -m venv .venv
```

Если Python 3.11 установлен через uv:

```bash
uv venv --python 3.11 .venv
```

Активируй окружение:

```bash
source .venv/bin/activate
```

Установи зависимости:

```bash
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
```

Проверь интерпретатор:

```bash
python --version
python -c 'import sys; print(sys.executable)'
```

Ожидается Python 3.11.x, а путь должен вести внутрь каталога проекта `.venv`.

Установи frontend-зависимости:

```bash
npm install
```

## 12. Запуск на Linux

**Терминал 1 — backend:**

```bash
cd /путь/к/life-engine
source .venv/bin/activate
python -m uvicorn genesis.server:app --host 127.0.0.1 --port 8000
```

**Терминал 2 — frontend:**

```bash
cd /путь/к/life-engine
npm run dev
```

Открой http://127.0.0.1:5173. Оба процесса должны оставаться запущенными.

---

# 13. Частые проблемы и решения

## Windows: `No runtime installed that matches 3.11`

**Причина:** Python Launcher не обнаружил Python 3.11. Наличие Python 3.13 не означает, что установлен Python 3.11.

Проверь установленные версии:

```powershell
py -0p
```

Установи 3.11:

```powershell
py install 3.11
```

Затем повтори создание окружения:

```powershell
py -3.11 -m venv .venv
```

## Windows: `Activate.ps1 cannot be loaded` / выполнение сценариев запрещено

Разреши выполнение скриптов только в текущем процессе PowerShell:

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
.\.venv\Scripts\Activate.ps1
```

Либо вообще не активируй окружение, а вызывай его Python напрямую:

```powershell
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe -m uvicorn genesis.server:app --host 127.0.0.1 --port 8000
```

## Установки прошли, но используется не тот Python

Проверь:

```powershell
where.exe python
py -0p
python -c "import sys; print(sys.executable)"
```

В Linux:

```bash
which -a python python3
python -c 'import sys; print(sys.executable)'
```

Используй Python из `.venv`. Не устанавливай зависимости повторно в глобальный Python.

## Ошибка при создании виртуального окружения

На Debian/Ubuntu-подобных системах может отсутствовать модуль venv:

```bash
sudo apt install python3-venv
```

Для конкретной версии Python пакет может называться `python3.11-venv`:

```bash
sudo apt install python3.11-venv
```

После установки повтори создание `.venv`.

## Linux: `uv: command not found` или `nvm: command not found`

Установщик обычно добавляет инициализацию в конфигурацию оболочки. Открой новый терминал. Для Bash попробуй:

```bash
source ~/.bashrc
```

Для Zsh:

```bash
source ~/.zshrc
```

Если не помогло, проверь вывод установщика и наличие каталогов установки в PATH.

## `pip install` завершился ошибкой

Сначала обнови инструменты внутри активного окружения:

```bash
python -m pip install --upgrade pip setuptools wheel
python -m pip install -r requirements.txt
```

Проверь версию Python и архитектуру:

```bash
python --version
python -c 'import platform; print(platform.platform(), platform.machine())'
```

Для диагностики сохрани полный вывод ошибки. Не начинай с установки случайных системных библиотек: причина может быть в версии Python, архитектуре или недоступности бинарного колеса конкретного пакета.

## Ошибка установки или импорта PyTorch

Проверь, что используется Python 3.11 и правильное окружение:

```bash
python -c "import sys; print(sys.executable)"
python -m pip show torch
python -c "import torch; print(torch.__version__)"
```

Если установка оборвалась, повтори установку зависимостей в активном окружении. Не устанавливай CUDA-сборку наугад: для базового запуска проекта достаточно CPU-сборки PyTorch, если отдельная GPU-конфигурация не настроена.

## MuJoCo: ошибка загрузки библиотеки / OpenGL

На Linux проверь наличие системных графических библиотек и попробуй пакеты из раздела 8. На сервере без графической сессии может потребоваться headless-рендеринг и соответствующие системные библиотеки.

Если ошибка возникает при обычном импорте `mujoco`, а не при визуализации, пришли полный traceback: это может быть не проблема OpenGL.

## `Address already in use` / порт занят

Если порт 8000 занят, останови старый backend или выбери другой порт:

```bash
python -m uvicorn genesis.server:app --host 127.0.0.1 --port 8001
```

Если занят порт Vite, он обычно предложит следующий свободный порт. Открывай именно адрес, напечатанный в терминале.

## Frontend: `npm: command not found` или `node is not recognized`

Node.js не установлен либо терминал открыт до его установки. Установи Node.js 20 LTS или новее и открой новое окно терминала:

```bash
node --version
npm --version
```

## Frontend: `npm install` сообщает об ошибке зависимостей

Сначала проверь версии:

```bash
node --version
npm --version
```

Затем повтори:

```bash
npm install
```

Не удаляй lock-файл и не используй `--force` / `--legacy-peer-deps` без конкретной диагностики: это может скрыть несовместимость вместо её решения.

## Браузер открылся, но интерфейс не подключается к backend

Убедись, что backend запущен и в первом терминале нет traceback. Проверь локальный адрес API:

http://127.0.0.1:8000

Frontend и backend должны работать одновременно. Если менял порт backend, проверь настройки адреса API в текущей конфигурации frontend.

## Windows Defender / антивирус блокирует запуск

Проверь, какой именно файл заблокирован и откуда он получен. Не отключай антивирус целиком. Разрешай только подтверждённые файлы из официальных источников и локальный каталог проекта.

## Проект находится в WSL

Если запускаешь GENESIS внутри WSL, устанавливай Python, Node.js и зависимости внутри Linux-среды WSL. Не смешивай Windows Python/Node с Linux-окружением. Для первого запуска проще держать репозиторий в Linux-файловой системе WSL (например, `~/projects/life-engine`), а не в смонтированном `/mnt/c`.

---

# 14. Проверка установки

В активированном виртуальном окружении выполни:

```bash
python --version
python -c "import mujoco, gymnasium, torch, stable_baselines3, fastapi; print('Python dependencies: OK')"
node --version
npm --version
```

Проверка frontend-сборки из корня проекта:

```bash
npm run build
```

Если обе проверки проходят, окружение подготовлено. Затем запусти backend и frontend по инструкциям выше.

# 15. Как сообщить об ошибке

Если установка не удалась, приложи к Issue:

1. Операционную систему и её версию (например, Windows 10 22H2, Ubuntu 24.04, Fedora 44).
2. Архитектуру (обычно x64).
3. Вывод `python --version`, `node --version`, `npm --version`.
4. Вывод `python -c "import sys; print(sys.executable)"`.
5. Полный текст ошибки, начиная с первой строки traceback или сообщения об ошибке.
6. Команду, после которой возникла проблема.

Не прикладывай пароли, токены, приватные ключи и другие секреты.

---

## Текущий статус проекта

Эта инструкция описывает установку и запуск текущего прототипа. Успешный запуск сервера и интерфейса ещё не означает, что агент уже освоил ходьбу. Текущая задача — экспериментальная базовая среда управления телом и обучение с проверкой метрик. Необходимость и параметры длительного обучения зависят от производительности машины.
