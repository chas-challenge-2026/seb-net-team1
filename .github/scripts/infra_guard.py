#!/usr/bin/env python3
"""Kontrollerar att infra/docker-compose.yml följer deploy-plattformens kontrakt.

Rött X från denna kontroll betyder: er deploy skulle gå sönder om ändringen
rullas ut. Se DRIFT.md i repo-roten för detaljer.
"""
import os
import sys

import yaml

FILE = "infra/docker-compose.yml"


def main() -> int:
    if not os.path.isfile(FILE):
        print(f"FEL: {FILE} saknas.")
        print("Deploy-plattformen kräver att filen ligger kvar på denna plats.")
        return 1

    try:
        with open(FILE) as f:
            doc = yaml.safe_load(f)
    except yaml.YAMLError as e:
        print(f"FEL: {FILE} går inte att tolka som YAML:\n{e}")
        return 1

    errors = []
    services = (doc or {}).get("services") or {}

    if "app" not in services:
        errors.append(
            'tjänsten "app" saknas i services. Er publika adress pekar på '
            'tjänsten med namnet "app": byt inte namn på den.'
        )

    for name, svc in services.items():
        if isinstance(svc, dict) and svc.get("ports"):
            errors.append(
                f'tjänsten "{name}" använder "ports". Använd "expose" i denna fil: '
                "fasta host-portar krockar mellan team i driftmiljön. Lokala portar "
                "hör hemma i infra/docker-compose.override.yml."
            )

    app = services.get("app")
    if isinstance(app, dict) and not app.get("expose"):
        errors.append(
            'tjänsten "app" saknar "expose". Deploy-plattformen behöver veta '
            "vilken port appen lyssnar på."
        )

    if errors:
        print("Plattformskontraktet bryts: er deploy skulle gå sönder. Se DRIFT.md.\n")
        for e in errors:
            print(f" - {e}")
        return 1

    print("OK: infra/docker-compose.yml följer plattformskontraktet.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
