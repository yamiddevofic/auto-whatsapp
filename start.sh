#!/bin/bash
# Arranque local de Auto WhatsApp en una sesión de tmux con reinicio automático.
# Para producción, usa systemd en lugar de este script (ver Docs/03-plan-de-remediacion.md).
set -euo pipefail

SESSION="auto-whatsapp"
cd "$(dirname "$0")"

if [ ! -f .env ]; then
  echo "ERROR: falta el archivo .env. Copia .env.example a .env y complétalo:" >&2
  echo "  cp .env.example .env" >&2
  echo "  cd server && npm run hash-password -- 'TuContraseña'   # para AUTH_PASSWORD_HASH" >&2
  echo "  openssl rand -base64 48                                # para AUTH_SECRET" >&2
  exit 1
fi

echo "==> Compilando el frontend"
(cd client && npm run build)

tmux kill-session -t "$SESSION" 2>/dev/null || true
# Si era la última sesión, el servidor de tmux se está cerrando: esperar a que termine
# antes de crear la nueva, o falla con "server exited unexpectedly"
for _ in $(seq 1 20); do
  tmux has-session -t "$SESSION" 2>/dev/null || break
  sleep 0.2
done
sleep 0.5

# Reinicio con tope: un fallo de configuración no debe producir un bucle infinito.
tmux new-session -d -s "$SESSION" \
  'fails=0; while [ $fails -lt 20 ]; do
     node server/src/index.js || fails=$((fails+1));
     echo "[start.sh] El proceso terminó (fallos: $fails/20). Reiniciando en 5s...";
     sleep 5;
   done; echo "[start.sh] Demasiados fallos seguidos. Revisa la configuración."; sleep 300'

PORT=$(grep -E '^PORT=' .env | cut -d= -f2 || echo 3001)
echo "==> Servidor en tmux '$SESSION' → http://127.0.0.1:${PORT:-3001}"
echo "    Ver logs:  tmux attach -t $SESSION   (salir con Ctrl+B, D)"
echo "    Detener:   tmux kill-session -t $SESSION"
