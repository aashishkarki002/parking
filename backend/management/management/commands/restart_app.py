# management/management/commands/restart_app.py
"""
Bumps backend/tmp/restart.txt so CloudLinux Passenger reloads the app on the
next request (see backend/.htaccess and backend/passenger_wsgi.py — Passenger
has no separate process to kill/start on shared hosting, it just watches this
file's mtime).

This host has no automatable SSH, so CI can't run this directly. It's called
from management.views.restart_app_view (POST /api/ops/restart-app/), which
CI hits over HTTP after the FTP deploy step. Kept as a management command
(rather than inlining the touch in the view) so it can also be run by hand
from a cPanel Terminal session: `python manage.py restart_app`.

Usage:
    python manage.py restart_app
    python manage.py restart_app --migrate --collectstatic
"""
import os
import time

from django.conf import settings
from django.core.management import call_command
from django.core.management.base import BaseCommand, CommandError


class Command(BaseCommand):
    help = "Touches tmp/restart.txt to trigger a Passenger reload, optionally running migrate/collectstatic first."

    def add_arguments(self, parser):
        parser.add_argument(
            "--migrate", action="store_true",
            help="Run `migrate --noinput` before restarting.",
        )
        parser.add_argument(
            "--collectstatic", action="store_true",
            help="Run `collectstatic --noinput` before restarting.",
        )

    def handle(self, *args, **options):
        if options["migrate"]:
            self.stdout.write("Running migrate...")
            call_command("migrate", interactive=False, stdout=self.stdout, stderr=self.stderr)

        if options["collectstatic"]:
            self.stdout.write("Running collectstatic...")
            call_command("collectstatic", interactive=False, stdout=self.stdout, stderr=self.stderr)

        restart_file = self.touch_restart_file()
        self.stdout.write(self.style.SUCCESS(f"Touched {restart_file} -- Passenger will reload on the next request."))

    def touch_restart_file(self) -> str:
        tmp_dir = os.path.join(settings.BASE_DIR, "tmp")
        restart_file = os.path.join(tmp_dir, "restart.txt")
        try:
            os.makedirs(tmp_dir, exist_ok=True)
            now = time.time()
            if not os.path.exists(restart_file):
                open(restart_file, "a").close()
            os.utime(restart_file, (now, now))
        except OSError as exc:
            raise CommandError(f"Failed to touch {restart_file}: {exc}")
        return restart_file
