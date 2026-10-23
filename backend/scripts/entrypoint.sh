#!/bin/sh
set -e
alembic upgrade head
python -m scripts.seed
# PORT lo fija Render; en local, 8000. Detrás de un proxy (Render), FORWARDED_ALLOW_IPS="*" hace
# que uvicorn tome la IP real de X-Forwarded-For: sin ello el límite de peticiones por IP
# trataría a todos los usuarios como uno solo (la IP del proxy).
exec uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-8000}" --proxy-headers
