# Containerized BAAI/bge-m3 Embedding Worker
# Secure internal deployment for institutional examination grounding
# Pinned to specific model revision: 5617a9f61b028005a4858fdac845db406aefb181

FROM python:3.11-slim

WORKDIR /app

# Create non-root institutional service user
RUN useradd -u 10001 -m aura && \
    mkdir -p /app /home/aura/.cache && \
    chown -R aura:aura /app /home/aura

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app /app/app
RUN chown -R aura:aura /app

USER aura
ENV PATH=/home/aura/.local/bin:$PATH
ENV PYTHONUNBUFFERED=1
ENV MODEL_PATH=BAAI/bge-m3
ENV DEVICE=cpu

EXPOSE 8002

HEALTHCHECK --interval=10s --timeout=5s --start-period=30s --retries=3 \
    CMD python3 -c "import urllib.request; urllib.request.urlopen('http://localhost:8002/health')" || exit 1

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8002"]
