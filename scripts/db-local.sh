#!/bin/bash
# ─── Cluster Postgres LOCAL del proyecto (Fase 8 / Sprint de entorno) ───
# Reglas de seguridad (AGENTS.md §5.1):
#   - NUNCA tocar el Postgres personal del usuario (puerto 5432 ni /tmp/mh-pg).
#   - Este cluster vive SIEMPRE en /tmp/pg-local, puerto 54322, y usa su
#     propio directorio de datos y certificado SSL: aislado de todo lo demás.
#   - Las migraciones locales corren SOLO vía `db-local.sh migrate`: ese
#     comando fuerza DATABASE_URI y DATABASE_DIRECT_URL a la BD local, porque
#     payload.config.ts prioriza DATABASE_DIRECT_URL para migraciones —
#     exportar solo DATABASE_URI podría apuntar migraciones a Supabase.
set -e
DIR=/tmp/pg-local
PORT=54322
LOCAL_URI="postgresql://postgres@127.0.0.1:${PORT}/empresarial_dev"

cluster_is_valid() {
  [ -f "$DIR/PG_VERSION" ] && [ -f "$DIR/postgresql.conf" ]
}

server_ready() {
  psql "postgresql://postgres@127.0.0.1:${PORT}/empresarial_dev?sslmode=require" -c "SELECT 1;" >/dev/null 2>&1
}

case "${1:-}" in
  init)
    if [ -d "$DIR" ]; then
      if cluster_is_valid && server_ready; then
        echo "✅ Ya existe y responde: $LOCAL_URI"
        exit 0
      fi
      if cluster_is_valid && pg_ctl -D "$DIR" -o "-p $PORT -c listen_addresses=127.0.0.1" -l "$DIR.log" start >/dev/null 2>&1 && sleep 1 && server_ready; then
        echo "✅ Cluster existente iniciado y verificado: $LOCAL_URI"
        exit 0
      fi
      echo "❌ $DIR existe pero es un estado inválido o no arranca (init fallido previo)."
      echo "   Ejecuta: scripts/db-local.sh reset  (borra y recrea el cluster local)"
      exit 1
    fi
    initdb -D "$DIR" -U postgres --auth=trust >/dev/null
    (cd "$DIR" && openssl req -newkey rsa:2048 -nodes -keyout server.key -x509 -days 365 -out server.crt -subj "/CN=localhost" 2>/dev/null && chmod 600 server.key)
    echo "ssl = on" >> "$DIR/postgresql.conf"
    pg_ctl -D "$DIR" -o "-p $PORT -c listen_addresses=127.0.0.1" -l "$DIR.log" start >/dev/null
    sleep 1
    createdb "postgresql://postgres@127.0.0.1:${PORT}/postgres" empresarial_dev
    if server_ready; then
      echo "✅ Cluster local listo y verificado: $LOCAL_URI"
    else
      echo "❌ La BD no acepta conexiones tras el init. Ejecuta: scripts/db-local.sh reset"
      exit 1
    fi
    ;;
  start)
    pg_ctl -D "$DIR" -o "-p $PORT -c listen_addresses=127.0.0.1" -l "$DIR.log" start >/dev/null
    sleep 1
    server_ready && echo "✅ Puerto $PORT"
    ;;
  stop)
    pg_ctl -D "$DIR" stop && echo "🛑 Cluster local apagado"
    ;;
  reset)
    # Fix Devin #47: nunca borrar un cluster que sigue corriendo. Si el stop
    # falla tras los reintentos, abortar con guía en lugar de rm -rf ciego
    # (el proceso vivo mantendría el puerto 54322 tomado y bloquearía el init).
    if pg_ctl -D "$DIR" status >/dev/null 2>&1; then
      stopped=false
      for _ in 1 2 3; do
        if pg_ctl -D "$DIR" stop -m fast >/dev/null 2>&1; then
          stopped=true
          break
        fi
        sleep 1
      done
      if ! $stopped && pg_ctl -D "$DIR" status >/dev/null 2>&1; then
        echo "❌ No se pudo detener el cluster local (proceso vivo en el puerto $PORT)."
        echo "   Revisa $DIR.log y cierra el proceso manualmente antes de resetear."
        echo "   El directorio de datos NO fue tocado."
        exit 1
      fi
    fi
    rm -rf "$DIR" "$DIR.log"
    "$0" init
    ;;
  env)
    # Imprime las asignaciones listas para `eval`: FUERZA ambas variables a la
    # BD local, neutralizando cualquier DATABASE_DIRECT_URL del entorno/.env
    # (payload.config.ts la prioriza en migraciones).
    echo "export DATABASE_URI='$LOCAL_URI'"
    echo "export DATABASE_DIRECT_URL='$LOCAL_URI'"
    ;;
  migrate)
    # ÚNICA vía permitida para correr migraciones contra la BD local:
    # fija ambas variables y delega en payload migrate (args extra pasan).
    shift
    eval "$( "$0" env )"
    pnpm migrate "$@"
    ;;
  uri)
    echo "$LOCAL_URI"
    ;;
  *)
    echo "Uso: $0 {init|start|stop|reset|env|migrate|uri}"
    echo "  migrate: corre 'payload migrate' con las dos variables forzadas a la BD local."
    ;;
esac
