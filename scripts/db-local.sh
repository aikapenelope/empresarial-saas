#!/bin/bash
# ─── Cluster Postgres LOCAL del proyecto (Fase 8 / Sprint de entorno) ───
# Reglas de seguridad (AGENTS.md §6):
#   - NUNCA tocar el Postgres personal del usuario (puerto 5432 ni /tmp/mh-pg).
#   - Este cluster vive SIEMPRE en /tmp/pg-local, puerto 54322, y usa su
#     propio directorio de datos y certificado SSL: aislado de todo lo demás.
set -e
DIR=/tmp/pg-local
PORT=54322
URI="postgresql://postgres@127.0.0.1:${PORT}/empresarial_dev"

case "$1" in
  init)
    [ -d "$DIR" ] && { echo "Ya existe $DIR (usa start/stop/reset)"; exit 0; }
    initdb -D "$DIR" -U postgres --auth=trust >/dev/null
    (cd "$DIR" && openssl req -newkey rsa:2048 -nodes -keyout server.key -x509 -days 365 -out server.crt -subj "/CN=localhost" 2>/dev/null && chmod 600 server.key)
    echo "ssl = on" >> "$DIR/postgresql.conf"
    pg_ctl -D "$DIR" -o "-p $PORT -c listen_addresses=127.0.0.1" -l "$DIR.log" start
    sleep 1
    createdb "postgresql://postgres@127.0.0.1:${PORT}/postgres" empresarial_dev
    echo "✅ Cluster local listo en puerto $PORT (BD: empresarial_dev)"
    ;;
  start)
    pg_ctl -D "$DIR" -o "-p $PORT -c listen_addresses=127.0.0.1" -l "$DIR.log" start && sleep 1 && echo "✅ Puerto $PORT"
    ;;
  stop)
    pg_ctl -D "$DIR" stop && echo "🛑 Cluster local apagado"
    ;;
  reset)
    pg_ctl -D "$DIR" stop 2>/dev/null || true
    rm -rf "$DIR" "$DIR.log"
    "$0" init
    ;;
  uri)
    echo "$URI?sslmode=require"
    ;;
  *)
    echo "Uso: $0 {init|start|stop|reset|uri}"
    ;;
esac
