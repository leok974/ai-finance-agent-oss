#!/bin/sh#!/bin/sh

# CSP inline script hash management - DISABLED# /docker-entrypoint.d/10-csp-inline-hashes.sh

# All scripts are now external files, no inline scripts to hashset -eu

echo "[csp] inline script hashing disabled - all scripts are external"

exit 0if (set -o pipefail 2>/dev/null); then

  set -o pipefail
fi

MAIN_HTML="/usr/share/nginx/html/index.html"
CHAT_HTML="/usr/share/nginx/html/chat/index.html"
RUNTIME="/var/run/nginx-runtime"
CONF_DIR="${RUNTIME}/conf.d"
SEC="${CONF_DIR}/security-headers.conf"

log() { echo "[csp] $*"; }

# Prepare runtime config stage (assumes you boot nginx with -c ${RUNTIME}/nginx.conf)
mkdir -p "${CONF_DIR}"

# Extract inline <script> blocks (no src=) and hash them from BOTH HTML files
# We capture the exact inner text including newlines — CSP hashing is whitespace-sensitive.
tmp_scripts="$(mktemp)"
tmp_hashes="$(mktemp)"
trap 'rm -f "${tmp_scripts}" "${tmp_hashes}"' EXIT

# Process both HTML files
for HTML in "${MAIN_HTML}" "${CHAT_HTML}"; do
  if [ ! -f "${HTML}" ]; then
    log "warning: ${HTML} not found, skipping"
    continue
  fi

  log "processing ${HTML}"

  awk '
    BEGIN { in_script=0; buf="" }
    {
      line=$0
      if (match(tolower(line), /<script[^>]*>/)) {
        tag=line
        if (match(tolower(tag), /<script[^>]*\bsrc=/)) {
          next
        }
        in_script=1
        sub(/^[^>]*>/, "", line)
      }
      if (in_script==1) {
        if (match(tolower(line), /<\/script>/)) {
          sub(/<\/script>.*/, "", line)
          buf=buf line "\n"
          printf "%s", buf
          print "__INLINE_SCRIPT_SPLIT__"
          buf=""
          in_script=0
        } else {
          buf=buf line "\n"
        }
      }
    }
  ' "${HTML}" >> "${tmp_scripts}"
done

if ! grep -q "__INLINE_SCRIPT_SPLIT__" "${tmp_scripts}" 2>/dev/null; then
  log "no inline <script> blocks detected; nothing to hash"
  rm -f "${tmp_scripts}" "${tmp_hashes}"
  trap - EXIT
  exit 0
fi

: > "${tmp_hashes}"
block=""
while IFS= read -r line || [ -n "${line}" ]; do
  if [ "${line}" = "__INLINE_SCRIPT_SPLIT__" ]; then
    if [ -n "${block}" ]; then
      h="$(printf "%s" "${block}" | openssl dgst -sha256 -binary | openssl base64 -A)"
      printf "'sha256-%s'\n" "${h}" >> "${tmp_hashes}"
      block=""
    fi
  else
    block="${block}${line}
"
  fi
done < "${tmp_scripts}"

rm -f "${tmp_scripts}"

if [ -n "${block}" ]; then
  h="$(printf "%s" "${block}" | openssl dgst -sha256 -binary | openssl base64 -A)"
  printf "'sha256-%s'\n" "${h}" >> "${tmp_hashes}"
fi

HASHES="$(sort -u "${tmp_hashes}" | tr '\n' ' ' | sed 's/[[:space:]]*$//')"
rm -f "${tmp_hashes}"
trap - EXIT

if [ -z "${HASHES}" ]; then
  log "no hashes produced; skipping"
  exit 0
fi

# Ensure security headers file exists
if [ ! -f "${SEC}" ]; then
  log "warning: ${SEC} not found; checking for template..."
  # Try to copy from build-time template if it exists
  if [ -f "/etc/nginx/conf.d/security-headers.conf" ]; then
    log "copying template from /etc/nginx/conf.d/security-headers.conf"
    cp "/etc/nginx/conf.d/security-headers.conf" "${SEC}"
  else
    log "creating minimal security-headers.conf from scratch"
    mkdir -p "${CONF_DIR}"
    cat > "${SEC}" <<'NG'
add_header Content-Security-Policy "default-src 'self'; script-src 'self' __INLINE_SCRIPT_HASHES__" always;
NG
  fi
fi

# Prefer replacing placeholder; else append into existing script-src
if grep -q "__INLINE_SCRIPT_HASHES__" "${SEC}"; then
  sed -i "s#__INLINE_SCRIPT_HASHES__#${HASHES}#g" "${SEC}"
  log "rendered CSP via placeholder with $(echo "${HASHES}" | wc -w | xargs) hash(es)"
else
  tmp="${SEC}.tmp"
  awk -v H="${HASHES}" '
    BEGIN { done=0 }
    {
      line=$0
      if (!done && line ~ /Content-Security-Policy/ && line ~ /script-src/) {
        split(line, parts, /script-src/)
        pre=parts[1] "script-src"
        rest=substr(line, length(pre)+1)
        sub(/;/, " " H " ;", rest)
        print pre rest
        done=1
      } else {
        print line
      }
    }
  ' "${SEC}" > "${tmp}" && mv "${tmp}" "${SEC}"
  log "appended $(echo "${HASHES}" | wc -w | xargs) hash(es) into script-src"
fi

# Optional: expose a config version header if template contains placeholder
CFG="${CONF_DIR}/security-headers.conf"
if grep -q "X-Config-Version" "${CFG}" 2>/dev/null; then
  ver="$( (git rev-parse --short HEAD 2>/dev/null || true) )"
  [ -z "${ver}" ] && ver="$(date +%Y%m%d%H%M%S)"
  sed -i "s/__CONFIG_VERSION__/${ver}/g" "${CFG}" || true
  log "config version=${ver}"
fi

# show resulting CSP line for debugging
grep -n "Content-Security-Policy" "${SEC}" || true

# Self-test: ensure no placeholder remains in runtime config
if grep -q "__INLINE_SCRIPT_HASHES__" "${SEC}" 2>/dev/null; then
  log "ERROR: placeholder __INLINE_SCRIPT_HASHES__ still present in ${SEC}"
  cat "${SEC}"
  exit 1
fi

log "✓ CSP runtime config validated (no placeholders)"
