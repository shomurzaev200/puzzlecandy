# PUZZLECANDY

Премиальный магазин и панель управления: витрина, платежи по скриншоту, курьеры, Telegram-боты, операционный control center.

## Клонирование

```bash
git clone https://github.com/shomurzaev200/puzzlecandy.git
cd puzzlecandy
npm install
npm run dev
```

Админка: `/admin` (первый вошедший оператор становится SUPER_ADMIN).  
Магазин / касса / курьер: `/shop`, `/pay`, `/courier`.

Нужны Node 22+ и `npm`. Файл `.env` не обязателен: локально поднимается встроенная Postgres (PGLite). Для внешнего Postgres задайте `DATABASE_URL`.

## Что внутри

- Три Telegram-сценария (магазин, касса со скриншотом, курьер с фото/гео).
- Ledger в целых центах, подтверждение платежа только через CAS.
- Админка: заказы, платежи, курьеры, карта, аудит, RBAC.
- Операционный слой: split-view, quick actions, SLA, bulk, Inbox, omni-search, 360°, теги, возвраты, промо, выплаты, правила, вебхуки.
