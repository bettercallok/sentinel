#!/bin/bash
python manage.py collectstatic --noinput
python manage.py migrate
gunicorn core.wsgi:application --bind 0.0.0.0:7860 --workers 4
