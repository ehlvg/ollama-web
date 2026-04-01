# Ollama Web

Стandalone веб-приложение для Ollama с идентичным интерфейсом, но работающее как отдельный веб-сервис.

## Возможности

- Полностью идентичный интерфейс Ollama.app
- Хранение чатов в localStorage браузера
- Подключение к любому Ollama серверу по адресу
- Поддержка API ключей для cloud моделей
- Работает на любом устройстве в сети

## Установка

```bash
cd ollama-web
npm install
```

## Разработка

```bash
npm run dev
```

Приложение будет доступно на http://localhost:5173

## Сборка

```bash
npm run build
```

Собранные файлы будут в директории `dist/`.

## Запуск production версии

```bash
npm run preview
```

Или используйте любой статический сервер:

```bash
npx serve dist
```

## Настройка Ollama сервера

### Вариант 1: Тот же хост (рекомендуется)

Запустите Ollama на том же хосте, что и веб-приложение:

```bash
OLLAMA_ORIGINS="*" ollama serve
```

Затем откройте Settings в приложении и укажите адрес Ollama (по умолчанию `http://127.0.0.1:11434`).

### Вариант 2: Удалённый Ollama

Если Ollama работает на другом сервере:

1. Настройте Ollama сервердля принятия кросс-доменных запросов:
   ```bash
   OLLAMA_ORIGINS="*" ollama serve
   ```

2. Откройте Settings ввеб-приложении
3. Укажите адрес Ollama сервера (например, `http://192.168.1.100:11434`)
4. При необходимости укажите API ключ

## APIключи

Для использования cloud моделей ollama.com:

1. Откройте Settings
2. В поле "API Key" введите ваш ключ
3. Включите "Enable Cloud Models"

## Хранение данных

Все данные хранятся в localStorage браузера:

- Чаты: `ollama_web_chats`
- Настройки: `ollama_web_settings`
- Адрес сервера: `ollama_host`
- API ключ: `ollama_api_key`

## Деплой

### Vercel

```bash
npm run build
npx vercel dist
```

### Docker

```dockerfile
FROM nginx:alpine
COPY dist/ /usr/share/nginx/html/
EXPOSE 80
```

```bash
docker build -t ollama-web .
docker run -p 80:80 ollama-web
```

### Пример nginx конфигурации

```nginx
server {
    listen 80;
    server_name your-domain.com;
    
    root /path/to/ollama-web/dist;
    index index.html;
    
    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

## Отличия от оригинального Ollama.app

- Нет синхронизации чатов с облаком
- Авторизация через API ключ вместо signin через ollama.com
- Настройки хранятся локально в браузере
- Работает с любым удалённым Ollama сервером

##Локализация

Приложение наследует локализацию из оригинального Ollama.app. Текущий язык интерфейса: английский.

## Лицензия

MIT License (оригинальный Ollama использует MIT)