# PUZZLECANDY

Премиальный магазин и панель управления: витрина, платежи по скриншоту, курьеры, Telegram-боты, операционный control center.

## Требование: Node.js 22.12+

Проект **не работает на Node 18**. Vite 8 и TanStack Start требуют Node 22
(`styleText` из `node:util` появился только там).

Если `node -v` показывает `v18.x` — сначала обновите Node, иначе `npm run dev`
упадёт с `SyntaxError: does not provide an export named 'styleText'`.

### Ubuntu / Debian (VPS)

```bash
# 1. Поставить Node 22
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs
hash -r
node -v    # должно быть v22.x

# 2. Чистый клон (не внутрь уже существующей папки puzzlecandy)
cd ~
rm -rf puzzlecandy
git clone https://github.com/shomurzaev200/puzzlecandy.git
cd puzzlecandy

# 3. Публичный URL сервера (обязательно для входа с IP)
# Ubuntu 24 / AWS: метаданные только через IMDSv2-токен.
TOKEN=$(curl -s -X PUT "http://169.254.169.254/latest/api/token" -H "X-aws-ec2-metadata-token-ttl-seconds: 21600")
PUB=$(curl -s -H "X-aws-ec2-metadata-token: $TOKEN" http://169.254.169.254/latest/meta-data/public-ipv4)
echo "public-ipv4=$PUB"
# если PUB пустой — у инстанса нет публичного IP: AWS → Elastic IPs → Associate.
# не экспортируйте BETTER_AUTH_URL=http://:8080 — Vite падает.
export BETTER_AUTH_URL="http://${PUB}:8080"
export BETTER_AUTH_TRUSTED_ORIGINS="http://${PUB}:8080"

# 4. Круглосуточный запуск (systemd). Не держите `npm run dev` в SSH —
#    выключение ноутбука тогда рвёт сессию и убивает ботов/админку.
npm install
npm run seed:admin    # печатает email + пароль супер-админа ОДИН раз
sudo bash scripts/install-vps-service.sh
```

После этого **закройте SSH** — магазин, админка и Telegram-боты остаются на VPS.
Ноутбук можно выключать. Не запускайте второй `npm run dev`.

```bash
sudo systemctl status puzzlecandy
journalctl -u puzzlecandy -f
sudo systemctl restart puzzlecandy
```

Elastic IP в AWS обязателен, иначе после Stop/Start публичный адрес сменится.

Открывайте **с портом**: `http://ВАШ_ПУБЛИЧНЫЙ_IP:8080/admin`

Если браузер пишет `ERR_CONNECTION_REFUSED`:

1. `sudo systemctl status puzzlecandy` — `active (running)`. Если нет: `sudo systemctl restart puzzlecandy`.
2. AWS Security Group (inbound): TCP **8080** с `0.0.0.0/0`.
3. `sudo ufw allow 8080/tcp` (если ufw включён).
4. Не открывайте `http://IP` без `:8080` — это порт 80, его приложение не слушает.

Через nvm, без sudo:

```bash
curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash
source ~/.nvm/nvm.sh
nvm install 22
nvm use 22
node -v
```

Админка: `/admin`  
Магазин / касса / курьер: `/shop`, `/pay`, `/courier`

Первый администратор: `npm run seed:admin` **или** кнопка «Создать первый аккаунт» на `/login` (кнопка скрывается после появления первой учётки).

Сменить роль сотрудника (если зашли как оператор и не видите «Сотрудники»):

```bash
npm run set-role
npm run set-role -- ВАШ_EMAIL SUPER_ADMIN
```

После смены роли выйдите и войдите снова. В интерфейсе роль меняет только супер-админ: **Сотрудники и доступ** → выпадающий список роли.

Если админка пишет `Invalid server function ID` (страница не грузится после логина):

```bash
cd ~/puzzlecandy
git pull
sudo bash scripts/install-vps-service.sh
```

Затем в браузере: жёсткое обновление (Ctrl+Shift+R). Telegram-бот на HTTP-IP отвечает через long-poll, не через webhook.

Файл `.env` не обязателен: локально поднимается встроенная Postgres (PGLite).
Для внешнего Postgres задайте `DATABASE_URL`.

## Docker

```bash
docker compose up --build
```

Контейнер использует `node:22-alpine`. Postgres: `puzzlecandy / puzzlecandy`.

## Что внутри

- Три Telegram-сценария (магазин, касса со скриншотом, курьер с фото/гео).
- Ledger в целых центах, подтверждение платежа только через CAS.
- Админка: заказы, платежи, курьеры, карта, аудит, RBAC.
- Операционный слой: split-view, quick actions, SLA, bulk, Inbox, omni-search, 360°, теги, возвраты, промо, выплаты, правила, вебхуки.
