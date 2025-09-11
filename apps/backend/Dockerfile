FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

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
RUN sed -i 's/\r$//' /app/start.sh

EXPOSE 8000
RUN chmod +x /app/start.sh
CMD ["/app/start.sh"]
