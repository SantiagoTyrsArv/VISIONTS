FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /srv
COPY requirements.lock ./
# Versiones y hashes fijados en el lock; solo wheels, sin ejecutar setup.py de terceros.
RUN pip install --no-cache-dir --require-hashes --only-binary :all: -r requirements.lock
# Solo lo que necesita la API en tiempo de ejecución (sin tests, .env ni artefactos locales).
COPY alembic.ini ./
COPY alembic ./alembic
COPY app ./app
COPY scripts ./scripts
RUN chmod +x scripts/entrypoint.sh \
    && useradd --system --no-create-home senavoz
# Sin privilegios de root en tiempo de ejecución.
USER senavoz
EXPOSE 8000
CMD ["scripts/entrypoint.sh"]
