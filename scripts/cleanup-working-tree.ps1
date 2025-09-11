# Stop tracking secrets/artifacts already committed (keeps local copies)
git rm -r --cached .env 2>$null
git rm -r --cached .env.* 2>$null
git rm -r --cached *.pem *.key *.pfx serviceAccount*.json 2>$null
git rm -r --cached *.sqlite *.db 2>$null
git rm -r --cached node_modules dist build .vite .turbo __pycache__ .pytest_cache *.log 2>$null
git add .gitignore .dockerignore .env.example
git commit -m "chore(security): stop tracking secrets & build artifacts" 2>$null
