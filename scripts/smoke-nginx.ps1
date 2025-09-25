$NG = docker ps --format "{{.Names}}" | Where-Object { $_ -match 'nginx' } | Select-Object -First 1
if (-not $NG) { throw "nginx container not found" }

docker exec $NG sh -lc 'ls -lah /usr/share/nginx/html && head -n1 /usr/share/nginx/html/index.html || echo "no index.html"'
docker exec $NG sh -lc 'apk add --no-cache curl >/dev/null 2>&1 || true; echo "[root] / ->"; curl -sI http://127.0.0.1/ | head -n1; echo "[root] /favicon.ico ->"; curl -sI http://127.0.0.1/favicon.ico | head -n1'
docker exec $NG sh -lc 'echo "[backend] /healthz ->"; curl -sI http://backend:8000/healthz | head -n1'
