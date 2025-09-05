FROM python:3.11-slim

WORKDIR /app
RUN apt-get update \
 && apt-get install -y --no-install-recommends build-essential \
 && rm -rf /var/lib/apt/lists/*

# If requirements.txt exists, copy and install
COPY requirements.txt ./requirements.txt
RUN if [ -f requirements.txt ]; then \
      pip install --no-cache-dir --upgrade pip && \
      pip install --no-cache-dir -r requirements.txt ; \
    fi

# Copy the rest of the app (paths are relative to build context: apps/backend)
COPY . .

ENV PYTHONPATH=/app
EXPOSE 8000
CMD ["uvicorn","app.main:app","--host","0.0.0.0","--port","8000","--reload"]
