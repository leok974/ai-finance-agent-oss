FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PYTHONPATH=/app

WORKDIR /app
RUN apt-get update \
 && apt-get install -y --no-install-recommends bash build-essential \
 && rm -rf /var/lib/apt/lists/*

# Install dependencies if requirements.txt exists
COPY requirements.txt ./requirements.txt
RUN if [ -f requirements.txt ]; then \
      pip install --no-cache-dir --upgrade pip && \
      pip install --no-cache-dir -r requirements.txt ; \
    fi

# App code
COPY . .

# Normalize CRLF and make entrypoint executable
RUN sed -i 's/\r$//' /app/start.sh && chmod +x /app/start.sh

# Create non-root user and writable tmp
RUN addgroup --gid 10001 app && useradd --no-log-init --create-home --uid 10001 --gid 10001 app \
 && mkdir -p /tmp && chown -R 10001:10001 /tmp
USER 10001:10001

EXPOSE 8000
CMD ["/app/start.sh"]
