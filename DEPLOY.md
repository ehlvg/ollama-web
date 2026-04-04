# Деплой Ollama Web

Проект теперь рассчитан на cloud-first сценарий:

- фронтенд можно деплоить как обычный Vite SPA
- для Ollama Cloud и tools используется same-origin proxy через Vercel Functions
- отдельный `cors-proxy` больше не нужен
- Docker-деплой больше не тянет встроенный образ `ollama`

## Vercel

1. Импортируйте репозиторий в Vercel.
2. Build command: `npm run build`
3. Output directory: `dist`
4. Если хотите использовать Code Interpreter, добавьте переменные окружения:

```bash
VERCEL_TOKEN=...
VERCEL_TEAM_ID=...
VERCEL_PROJECT_ID=...
```

Без них фронтенд и обычный чат будут работать, но tool `Code Interpreter` не сможет создавать Sandbox.

## Docker

Текущий `deploy/docker-compose.yml` поднимает только статический `nginx` с собранным `dist/`.

```bash
npm install
npm run build
cd deploy
docker compose up -d
```

UI будет доступен на `http://<HOST>:8085`.

## CORS

- Для `https://ollama.com` отдельный `cors-proxy` не используется: запросы идут через встроенный same-origin proxy.
- Для произвольного удалённого Ollama endpoint в браузере по-прежнему важен корректный публичный адрес.
- Через Vercel proxy намеренно не пускаются private/loopback хосты.
