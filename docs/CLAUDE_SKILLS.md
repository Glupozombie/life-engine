# Claude Skills для LIFE ENGINE без Claude Code

Skills доступны и в обычном Claude chat на поддерживаемых Free, Pro, Max, Team и Enterprise аккаунтах, если включено выполнение кода и создание файлов. Это отдельная функция Claude.ai, а не подписка Claude Code. См. официальные инструкции:
- https://support.claude.com/en/articles/12512180-use-skills-in-claude
- https://support.claude.com/en/articles/12512198-how-to-create-custom-skills

## Где включать
1. Claude → Settings → Capabilities.
2. Включить Code execution and file creation / Create and edit files.
3. Открыть Customize → Skills.
4. Нажать + → Create skill → Upload a skill и загрузить ZIP с папкой навыка внутри.
Если раздела нет, проверь доступность capability; в организациях доступ может ограничить администратор.

## Что полезно
1. Custom skill «LIFE ENGINE repository workflow» — при каждом задании читает AGENTS.md, CURRENT_STATE и ROADMAP, изучает код до правок, проверяет реальные команды и честно отмечает непроверенное. Лучше всего подходит проекту.
2. Навык для работы с кодом из каталога Skills — если доступен; помогает разбивать задачу на реализацию и проверку, но не заменяет доступ к файлам проекта.
3. GitHub connector — это подключение, не Skill. Нужен, если Claude должен читать актуальные файлы репозитория, а не только ZIP/вставленный код.
4. Встроенные Word/PDF/Excel/PowerPoint skills не нужны для ежедневного кодинга, но полезны для проектной документации.

Не устанавливай неизвестные skills вслепую: ZIP может содержать инструкции и исполняемые ресурсы. Просматривай содержимое перед включением.