param([string]$Path = "apps/web")

Push-Location $Path
try {
  if (Test-Path pnpm-lock.yaml) {
    pnpm i --frozen-lockfile
  } elseif (Test-Path package-lock.json) {
    npm ci
  } else {
    npm i
  }
  npm run build
}
finally {
  Pop-Location
}
