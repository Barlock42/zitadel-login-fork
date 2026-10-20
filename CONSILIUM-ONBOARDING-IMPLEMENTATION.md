# Реализация первого входа Consilium

Ветка основана на `fix/native-app-redirect`: исправление callback мобильного приложения сохранено. Новый сценарий включён только на отдельном тестовом Login V2. Production deployment не менялся.

Обязательные настройки: `CONSILIUM_PASSKEY_ONBOARDING=true`, `CONSILIUM_ORGANIZATION_ID`, секрет `LOGIN_VERIFICATION_SECRET` длиной не менее 32 символов. Для совместного host с production задаются `LOGIN_COOKIE_PREFIX=consilium_test_` и build arg `LOGIN_BASE_PATH=/ui/v2/consilium-test`; `CONSILIUM_PORTAL_URL` при сборке и `DEFAULT_REDIRECT_URI` при запуске указывают на тестовый портал. Нужны обычные credentials Login client с правами User/Session API.

`/verify?...&invite=true` показывает одну кнопку и не проверяет код на GET/HEAD/prefetch. Неподдерживаемый браузер получает объяснение до потребления кода. После нажатия сервер проверяет организацию пользователя, принимает invite и выдаёт HttpOnly HMAC proof на пять минут, связанный с user ID, browser fingerprint и целью enrollment. Это право продолжить регистрацию ключа, а не аутентифицированный сеанс. Коды и WebAuthn-ответы в proof не хранятся.

Компонент напрямую выполняет регистрацию Passkey и переходит к стандартной проверке ключа. Для v4.15.3 create и get — разные операции. После проверки `DEFAULT_REDIRECT_URI` открывает портал, штатный OIDC использует сохранённый сеанс. У существующего пользователя используется его способ входа. Отмена создания позволяет повторить действие с действующим proof без второго invite. Bearer code удаляется из адресной строки после принятия; verification/recovery pages задают no-referrer.

Cookies canary отделены префиксом и путём. Server-side guard запрещает отправку/проверку кодов и регистрацию ключа пользователя другой организации в режиме Consilium. Вход по email принудительно ограничен настроенной организацией. Без feature flag сохраняется исходное поведение. Поддержка восстановления использует отдельную registration link; в режиме Consilium GET `/passkey/set` не запускает WebAuthn автоматически.

Проверено: 82 теста в шести файлах, Docker build с TypeScript-проверкой и Prettier изменённых файлов. Полный lint сообщает ранее существовавшие нарушения форматирования в `client-utils.test.ts`, `idp-intent.test.ts`, `idp-intent.ts`. На тестовом портале пройдены первый вход для обоих состояний почты, повторное использование обоих видов сеанса, вход после очистки сеансов, отмена/повтор, восстановление и выход.

Измерения выполнялись в Windows/Chrome с virtual WebAuthn authenticator. Реальные Windows Hello, iPhone/Safari, Android/Chrome и native application callback требуют отдельной проверки перед production. Подробный отчёт и откат: `pharmgpt/infra-k8s`, `selectel/ozon-doctors-test/ONBOARDING.md`, ветка `codex/consilium-passkey-staging`.
