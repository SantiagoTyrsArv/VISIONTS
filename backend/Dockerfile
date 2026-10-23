FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /srv
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
RUN chmod +x scripts/entrypoint.sh \
    && useradd --system --no-create-home senavoz
# Sin privilegios de root en tiempo de ejecución.
USER senavoz
EXPOSE 8000
CMD ["scripts/entrypoint.sh"]
