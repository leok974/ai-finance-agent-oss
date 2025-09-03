.PHONY: fmt lint dev

fmt:
	yapf -ir apps/backend || true
	npx prettier -w apps/web || true

dev:
	uvicorn app.main:app --app-dir apps/backend --reload
