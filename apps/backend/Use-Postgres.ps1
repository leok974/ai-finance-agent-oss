# apps\backend\Use-Postgres.ps1
$env:DATABASE_URL = "postgresql+psycopg://myuser:mypassword@localhost:5432/finance"
$env:PYTHONPATH = "."
Write-Host "DATABASE_URL set to Postgres. Ready for: alembic upgrade head"
# apps\backend\Use-Postgres.ps1
$env:DATABASE_URL = "postgresql+psycopg://myuser:mypassword@localhost:5432/finance"
$env:PYTHONPATH = "."
Write-Host "DATABASE_URL set to Postgres. Ready for: alembic upgrade head"
