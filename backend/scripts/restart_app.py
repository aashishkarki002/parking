#!/usr/bin/env python3
"""Restart the Passenger-hosted Django backend and verify it comes back healthy.

This host (cPanel/CloudLinux) has no automatable SSH, so there's no way to
touch backend/tmp/restart.txt directly from CI. Instead, the actual restart
happens server-side via a token-gated HTTP endpoint,
management.views.restart_app_view (POST /api/ops/restart-app/), which runs
the `restart_app` management command (management/management/commands/restart_app.py).

This script is the client half: it calls that endpoint, then polls the
public URL until the app responds, so CI (github/parking.yml) gets a real
pass/fail signal instead of firing an HTTP request and hoping for the best.

Usage:
    RESTART_TOKEN=xxx python3 restart_app.py
    python3 restart_app.py --restart-url https://backend.parking.sallyanhouse.com/api/ops/restart-app/ \\
                            --health-url https://backend.parking.sallyanhouse.com/ \\
                            --token xxx
"""

import argparse
import json
import logging
import os
import sys
import time
import urllib.error
import urllib.request

DEFAULT_RESTART_URL = "https://backend.parking.sallyanhouse.com/api/ops/restart-app/"
DEFAULT_HEALTH_URL = "https://backend.parking.sallyanhouse.com/"
DEFAULT_TIMEOUT = 180
DEFAULT_INTERVAL = 3
DEFAULT_REQUEST_TIMEOUT = 30

logger = logging.getLogger("restart_app")


def trigger_restart(url: str, token: str, migrate: bool, collectstatic: bool, request_timeout: int) -> None:
    payload = json.dumps({"migrate": migrate, "collectstatic": collectstatic}).encode()
    req = urllib.request.Request(
        url,
        data=payload,
        method="POST",
        headers={
            "Content-Type": "application/json",
            "X-Restart-Token": token,
            "User-Agent": "restart-app/1.0",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=request_timeout) as resp:
            body = resp.read().decode(errors="replace")
            logger.info("Restart endpoint responded %d: %s", resp.getcode(), body[:2000])
    except urllib.error.HTTPError as exc:
        body = exc.read().decode(errors="replace")
        raise RuntimeError(f"Restart endpoint returned HTTP {exc.code}: {body[:2000]}") from exc
    except urllib.error.URLError as exc:
        raise RuntimeError(f"Failed to reach restart endpoint: {exc}") from exc


def wait_for_health(url: str, timeout: int, interval: int, request_timeout: int) -> bool:
    deadline = time.monotonic() + timeout
    attempt = 0
    last_error = None
    while time.monotonic() < deadline:
        attempt += 1
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "restart-app-healthcheck/1.0"})
            with urllib.request.urlopen(req, timeout=request_timeout) as resp:
                status = resp.getcode()
                if 200 <= status < 400:
                    logger.info("Health check succeeded on attempt %d (status %d)", attempt, status)
                    return True
                last_error = f"unexpected status {status}"
                logger.warning("Attempt %d: %s", attempt, last_error)
        except (urllib.error.URLError, OSError) as exc:
            last_error = str(exc)
            logger.warning("Attempt %d failed: %s", attempt, last_error)
        time.sleep(interval)
    logger.error("Health check did not succeed within %ds (last error: %s)", timeout, last_error)
    return False


def parse_args():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--restart-url", default=os.environ.get("RESTART_URL", DEFAULT_RESTART_URL),
                         help="POST endpoint that triggers the server-side restart")
    parser.add_argument("--health-url", default=os.environ.get("RESTART_HEALTH_URL", DEFAULT_HEALTH_URL),
                         help="URL to poll after restart to confirm the app is back up")
    parser.add_argument("--token", default=os.environ.get("RESTART_TOKEN"),
                         help="Shared secret sent as X-Restart-Token (default: $RESTART_TOKEN)")
    parser.add_argument("--migrate", action="store_true", default=True, help="Run migrate before restarting (default: on)")
    parser.add_argument("--no-migrate", dest="migrate", action="store_false")
    parser.add_argument("--collectstatic", action="store_true", default=True, help="Run collectstatic before restarting (default: on)")
    parser.add_argument("--no-collectstatic", dest="collectstatic", action="store_false")
    parser.add_argument("--timeout", type=int, default=DEFAULT_TIMEOUT, help="Seconds to wait for a healthy response")
    parser.add_argument("--interval", type=int, default=DEFAULT_INTERVAL, help="Seconds between health check attempts")
    parser.add_argument("--request-timeout", type=int, default=DEFAULT_REQUEST_TIMEOUT, help="Per-request timeout in seconds")
    parser.add_argument("--no-health-check", action="store_true", help="Only trigger the restart; skip polling for health")
    parser.add_argument("--verbose", action="store_true", help="Enable debug logging")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format="%(asctime)s [%(levelname)s] %(message)s",
    )

    if not args.token:
        logger.error("No restart token provided. Pass --token or set $RESTART_TOKEN.")
        return 2

    logger.info("Triggering restart via %s", args.restart_url)
    try:
        trigger_restart(args.restart_url, args.token, args.migrate, args.collectstatic, args.request_timeout)
    except RuntimeError as exc:
        logger.error("%s", exc)
        return 1

    if args.no_health_check:
        return 0

    logger.info("Waiting for %s to become healthy (timeout=%ds)", args.health_url, args.timeout)
    healthy = wait_for_health(args.health_url, args.timeout, args.interval, args.request_timeout)
    return 0 if healthy else 1


if __name__ == "__main__":
    sys.exit(main())
