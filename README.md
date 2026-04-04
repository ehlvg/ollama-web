# Ollama Web

Standalone веб-клиент для Ollama с UI в духе Ollama.app и cloud-first конфигурацией.

## Что изменилось

- дефолтный endpoint: `https://ollama.com`
- в Settings остались только адрес Ollama, тема и API key
- Docker-деплой больше не тянет тяжёлый образ `ollama`
- cloud tools и `Code Interpreter` работают через встроенные serverless endpoints
- поиск моделей умеет добирать результаты из каталога Ollama Cloud и подтягивать их по выбору пользователя

## Разработка

```bash
npm install
npm run dev
```

## Сборка

```bash
npm run build
```

## Тесты

```bash
npm test
```

## Деплой

- Vercel: основной рекомендуемый сценарий
- Docker: лёгкий static-only вариант без локального Ollama

Подробности: [DEPLOY.md](./DEPLOY.md)
