#!/usr/bin/env bash
# Install PUZZLECANDY as a systemd service so admin + bots stay up
# after SSH disconnect, laptop sleep, and VPS reboot.
set -euo pipefail

if [[ ${EUID} -ne 0 ]]; then
  echo "Запустите: sudo bash scripts/install-vps-service.sh"
  exit 1
fi

APP_USER="${SUDO_USER:-ubuntu}"
if [[ "${APP_USER}" == "root" ]]; then
  APP_USER="ubuntu"
fi
APP_HOME="$(eval echo "~${APP_USER}")"
APP_DIR="${APP_HOME}/puzzlecandy"
SERVICE_PATH="/etc/systemd/system/puzzlecandy.service"
ENV_PATH="/etc/puzzlecandy.env"

if [[ ! -d "${APP_DIR}" ]]; then
  echo "Нет каталога ${APP_DIR}. Сначала: git clone … && npm install"
  exit 1
fi
if [[ ! -f "${APP_DIR}/package.json" ]]; then
  echo "В ${APP_DIR} нет package.json"
  exit 1
fi

# Resolve node/npm for this user (nodesource /usr/bin or nvm).
NODE_BIN="$(sudo -iu "${APP_USER}" command -v node 2>/dev/null || true)"
NPM_BIN="$(sudo -iu "${APP_USER}" command -v npm 2>/dev/null || true)"
if [[ -z "${NODE_BIN}" || -z "${NPM_BIN}" ]]; then
  [[ -x /usr/bin/node ]] && NODE_BIN=/usr/bin/node
  [[ -x /usr/bin/npm ]] && NPM_BIN=/usr/bin/npm
fi
if [[ -z "${NODE_BIN}" || -z "${NPM_BIN}" ]]; then
  echo "Node.js 22 не найден у пользователя ${APP_USER}. node -v должен быть v22.x"
  exit 1
fi
NODE_DIR="$(dirname "${NODE_BIN}")"

PUB=""
TOKEN="$(curl -sS -m 3 -X PUT "http://169.254.169.254/latest/api/token" \
  -H "X-aws-ec2-metadata-token-ttl-seconds: 21600" 2>/dev/null || true)"
if [[ -n "${TOKEN}" ]]; then
  PUB="$(curl -sS -m 3 -H "X-aws-ec2-metadata-token: ${TOKEN}" \
    http://169.254.169.254/latest/meta-data/public-ipv4 2>/dev/null || true)"
fi
PUB="${PUB//$'\n'/}"
if [[ -z "${PUB}" ]]; then
  PUB="$(curl -sS -m 4 https://checkip.amazonaws.com 2>/dev/null | tr -d '[:space:]' || true)"
fi
if [[ ! "${PUB}" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  PUB=""
fi

AUTH_URL=""
if [[ -n "${PUB}" ]]; then
  AUTH_URL="http://${PUB}:8080"
fi

umask 077
cat > "${ENV_PATH}" <<EOF
# PUZZLECANDY — правьте IP здесь, затем: sudo systemctl restart puzzlecandy
NODE_ENV=development
EOF
if [[ -n "${AUTH_URL}" ]]; then
  cat >> "${ENV_PATH}" <<EOF
BETTER_AUTH_URL=${AUTH_URL}
BETTER_AUTH_TRUSTED_ORIGINS=${AUTH_URL}
APP_PUBLIC_URL=${AUTH_URL}
EOF
fi
chown root:"${APP_USER}" "${ENV_PATH}"
chmod 640 "${ENV_PATH}"

cat > "${SERVICE_PATH}" <<EOF
[Unit]
Description=PUZZLECANDY shop + Telegram bots + admin
After=network-online.target
Wants=network-online.target
StartLimitIntervalSec=0

[Service]
Type=simple
User=${APP_USER}
Group=${APP_USER}
WorkingDirectory=${APP_DIR}
EnvironmentFile=-${ENV_PATH}
Environment=PATH=${NODE_DIR}:/usr/local/bin:/usr/bin:/bin
ExecStart=${NPM_BIN} run dev
Restart=always
RestartSec=4
KillMode=control-group
TimeoutStopSec=25
StandardOutput=append:${APP_HOME}/puzzlecandy-dev.log
StandardError=append:${APP_HOME}/puzzlecandy-dev.log

[Install]
WantedBy=multi-user.target
EOF

# Stop leftover SSH/nohup copies so only systemd owns :8080.
pkill -u "${APP_USER}" -f 'vite dev' 2>/dev/null || true
pkill -u "${APP_USER}" -f 'with-app-env.mjs' 2>/dev/null || true
sleep 2
fuser -k 8080/tcp 2>/dev/null || true
sleep 1

systemctl daemon-reload
systemctl enable puzzlecandy
systemctl restart puzzlecandy

echo
echo "===== PUZZLECANDY systemd ====="
echo "user:    ${APP_USER}"
echo "dir:     ${APP_DIR}"
echo "node:    ${NODE_BIN}"
echo "url:     ${AUTH_URL:-'(IP не найден — откройте Elastic IP в AWS)'}"
echo "env:     ${ENV_PATH}"
echo
sleep 6
systemctl --no-pager --full status puzzlecandy || true
echo
echo "Логи:    journalctl -u puzzlecandy -f"
echo "         tail -f ${APP_HOME}/puzzlecandy-dev.log"
echo "Рестарт: sudo systemctl restart puzzlecandy"
echo
echo "Ноут можно выключать. Не запускайте npm run dev вручную."
echo "Не Stop Instance в AWS — тогда упадёт и сервер."
