#!/usr/bin/env bash
set -euo pipefail

# Usage:
#   bash deploy_server.sh
#   bash deploy_server.sh --port 3000 --app-dir /home/ubuntu/volleyball-quiz

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_NAME="volleyball-quiz"
ENTRY_FILE="server.js"
PORT="3000"
NODE_ENV="production"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --port)
      PORT="${2:-}"
      shift 2
      ;;
    --app-dir)
      APP_DIR="${2:-}"
      shift 2
      ;;
    --app-name)
      APP_NAME="${2:-}"
      shift 2
      ;;
    --help|-h)
      echo "用法:"
      echo "  bash deploy_server.sh [--port 3000] [--app-dir /path/to/app] [--app-name name]"
      exit 0
      ;;
    *)
      echo "未知参数: $1"
      exit 1
      ;;
  esac
done

if [[ -z "$PORT" || -z "$APP_DIR" || -z "$APP_NAME" ]]; then
  echo "参数不能为空，请检查 --port --app-dir --app-name"
  exit 1
fi

if [[ ! -d "$APP_DIR" ]]; then
  echo "目录不存在: $APP_DIR"
  exit 1
fi

cd "$APP_DIR"

if [[ ! -f "$ENTRY_FILE" ]]; then
  echo "未找到启动文件: $APP_DIR/$ENTRY_FILE"
  exit 1
fi

echo "==> 开始部署目录: $APP_DIR"

if command -v git >/dev/null 2>&1 && [[ -d ".git" ]]; then
  echo "==> 检测到 git 仓库，尝试拉取最新代码"
  git pull --ff-only || echo "git pull 失败，继续使用当前代码部署"
fi

if [[ -f "package-lock.json" ]]; then
  echo "==> 安装依赖 (npm ci)"
  npm ci
elif [[ -f "package.json" ]]; then
  echo "==> 安装依赖 (npm install)"
  npm install
else
  echo "==> 未检测到 package.json，跳过依赖安装"
fi

export PORT NODE_ENV

if command -v pm2 >/dev/null 2>&1; then
  echo "==> 使用 PM2 启动/重启服务"
  if pm2 describe "$APP_NAME" >/dev/null 2>&1; then
    pm2 restart "$APP_NAME" --update-env
  else
    pm2 start "$ENTRY_FILE" --name "$APP_NAME" --update-env
  fi
  pm2 save >/dev/null 2>&1 || true
else
  echo "==> 未安装 PM2，使用 nohup 启动"
  PID_FILE=".${APP_NAME}.pid"
  LOG_FILE=".${APP_NAME}.log"

  if [[ -f "$PID_FILE" ]]; then
    OLD_PID="$(cat "$PID_FILE" 2>/dev/null || true)"
    if [[ -n "${OLD_PID:-}" ]] && kill -0 "$OLD_PID" >/dev/null 2>&1; then
      kill "$OLD_PID" || true
      sleep 1
    fi
  fi

  nohup node "$ENTRY_FILE" > "$LOG_FILE" 2>&1 &
  echo $! > "$PID_FILE"
fi

PUBLIC_IP=""
try_get_public_ip() {
  local url="$1"
  if command -v curl >/dev/null 2>&1; then
    curl -fsS --max-time 3 "$url" 2>/dev/null || true
    return
  fi
  if command -v wget >/dev/null 2>&1; then
    wget -qO- "$url" 2>/dev/null || true
  fi
}

for endpoint in \
  "https://api64.ipify.org" \
  "https://api.ipify.org" \
  "https://ifconfig.me/ip" \
  "https://ipv4.icanhazip.com"; do
  PUBLIC_IP="$(try_get_public_ip "$endpoint" | tr -d '[:space:]')"
  if [[ -n "$PUBLIC_IP" ]]; then
    break
  fi
done

echo ""
echo "================ 部署完成 ================"
if [[ -n "$PUBLIC_IP" ]]; then
  echo "PC/手机可访问链接: http://$PUBLIC_IP:$PORT/"
else
  echo "未能自动识别公网 IP。请手动替换为你的服务器公网 IP："
  echo "PC/手机可访问链接: http://<你的公网IP>:$PORT/"
fi
echo ""
echo "如果外网无法访问，请检查："
echo "1) 云服务器安全组是否放行 TCP $PORT"
echo "2) 服务器防火墙是否放行端口 $PORT"
echo "=========================================="
