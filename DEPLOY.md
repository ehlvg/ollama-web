# Деплой Ollama Web “под ключ” (Ollama + CORS proxy + веб)

Цель: развернуть приложение так, чтобы оно стало доступно из интернета, при этом:

- **Ollama** автоматически поднимается на хосте деплоя
- браузер **не ходит к `127.0.0.1`**, а работает через **reverse-proxy** на том же домене
- поднимается **CORS proxy** для инструментов `web_search` / `web_fetch` (ollama.com)

Ниже — вариант “проще всего” через Docker Compose (рекомендуется), и вариант с доменом/SSL.

## Требования

- Linux VPS/сервер (Ubuntu/Debian и т.п.)
- Домен (опционально, но рекомендуется)
- Установленные: `git`, `docker`, `docker compose` (plugin)

## Вариант A (рекомендуется): Docker Compose + Nginx в контейнере

### 1) Склонировать и собрать фронтенд

На вашем сервере:

```bash
git clone <ВАШ_РЕПОЗИТОРИЙ> ollama-web
cd ollama-web
npm install
npm run build
```

В результате появится `dist/`.

### 2) Запустить Ollama + CORS proxy + web

```bash
cd deploy
docker compose up -d
docker compose ps
```

По умолчанию веб поднимется на **порту `8085`**:

- `http://<SERVER_IP>:8085`

### 3) Проверка, что всё работает

Откройте в браузере:

- `http://<SERVER_IP>:8085` — UI должен загрузиться

Проверка Ollama через тот же origin:

- `http://<SERVER_IP>:8085/ollama/api/version`

Если возвращает JSON с `version` — прокси работает.

### 4) Модели (первый запуск)

Обычно удобно “прогреть” модель заранее:

```bash
docker compose exec ollama ollama pull llama3.2:3b
```

Проверить список:

```bash
docker compose exec ollama ollama list
```

### 5) Настройки приложения (без ручного ввода хоста)

В `deploy/docker-compose.yml` веб контейнер монтирует `deploy/config.js` как `/config.js`.
Это задаёт дефолтные значения:

- `ollamaHost: "/ollama"`
- `corsProxyUrl: "/proxy"`

Если пользователь в UI поменяет Settings — это сохранится в `localStorage` и перезапишет дефолты.

## Вариант B: сделать красиво с доменом + SSL (Caddy на хосте)

Если вы хотите `https://chat.example.com`:

1. Запускайте docker compose без публикации порта наружу (или оставьте как есть).
2. Поставьте Caddy на хост.
3. Проксируйте домен на `localhost:8085`.

Пример `Caddyfile`:

```caddyfile
chat.example.com {
  f
  reverse_proxy 127.0.0.1:8085
}
```

После этого:

- UI: `https://chat.example.com`
- Ollama API: `https://chat.example.com/ollama/api/version`

## Как “показать миру” одной командой (после первого раза)

В каталоге репо на сервере:

```bash
npm run build && cd deploy && docker compose up -d --pull always
```

## Обновление версии

```bash
cd ollama-web
git pull
npm install
npm run build
cd deploy
docker compose up -d --pull always
```

## Где лежат данные

Модели/кэш Ollama хранятся в docker volume `ollama` (переживает перезапуски).

## Частые проблемы

### UI пишет “Not connected”

Проверьте:

- `http://<HOST>:8085/ollama/api/version`

Если не открывается — проблема в reverse-proxy (nginx) или контейнере `ollama`.

### Web search/web fetch падает из-за CORS

Проверьте:

- В Settings → **CORS Proxy** должно быть `/proxy` (или пусто/другое, если вы используете свой прокси)
- `http://<HOST>:8085/proxy/web_search` должен хотя бы отвечать (ошибка 405 на GET — нормально; это POST endpoint)

### Доступ к Ollama “напрямую” из интернета

В этом деплое Ollama **не публикуется** отдельным портом наружу.
Доступ идёт только через `web` и путь `/ollama/`*.