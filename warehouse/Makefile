# dbt Makefile for LedgerMind Warehouse
# Uses Docker container approach on shared-ollama network
# Run from warehouse/ directory

NETWORK=shared-ollama
IMAGE=ghcr.io/dbt-labs/dbt-postgres:1.7.0
MOUNT=-v "$$(pwd):/work" -w /work
DOCKER_RUN=docker run --rm -it --network $(NETWORK) $(MOUNT) $(IMAGE)

.PHONY: help debug deps build staging marts test dbt-test clean docs dbt-freshness

help:
	@echo "LedgerMind dbt Warehouse Commands"
	@echo "=================================="
	@echo "make debug       - Test database connection"
	@echo "make deps        - Install dbt packages"
	@echo "make build       - Build all models (staging + marts)"
	@echo "make staging     - Build staging models only"
	@echo "make marts       - Build marts models only"
	@echo "make test        - Run dbt tests"
	@echo "make dbt-test    - Run dbt tests (alias)"
	@echo "make dbt-freshness - Check source data freshness"
	@echo "make docs        - Generate dbt documentation"
	@echo "make clean       - Remove target/ directory"
	@echo ""
	@echo "Prerequisites:"
	@echo "  - Docker running"
	@echo "  - shared-ollama network exists"
	@echo "  - postgres container running"

debug:
	@echo "Testing dbt connection..."
	$(DOCKER_RUN) debug --profiles-dir .

deps:
	@echo "Installing dbt packages..."
	$(DOCKER_RUN) deps --profiles-dir .

staging:
	@echo "Building staging models..."
	$(DOCKER_RUN) run --profiles-dir . --select staging

marts:
	@echo "Building marts models..."
	$(DOCKER_RUN) run --profiles-dir . --select marts

build:
	@echo "Building all models..."
	$(DOCKER_RUN) build --profiles-dir .

test:
	@echo "Running tests..."
	$(DOCKER_RUN) test --profiles-dir .

dbt-test: test

dbt-freshness:
	@echo "Checking source data freshness..."
	$(DOCKER_RUN) source freshness --profiles-dir .

docs:
	@echo "Generating dbt documentation..."
	$(DOCKER_RUN) docs generate --profiles-dir .

clean:
	@echo "Cleaning target directory..."
	rm -rf target/
	rm -rf logs/
