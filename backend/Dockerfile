FROM python:3.12-slim AS base
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /srv
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Servicio trainer: añade PyTorch CPU y NumPy, que la API no necesita.
FROM base AS trainer
COPY requirements-train.txt ./
RUN pip install --no-cache-dir -r requirements-train.txt
COPY . .
CMD ["python", "-m", "app.training.worker"]

# API (objetivo por defecto, el último): imagen ligera sin dependencias de ML.
FROM base AS api
COPY . .
RUN chmod +x scripts/entrypoint.sh
EXPOSE 8000
CMD ["scripts/entrypoint.sh"]
