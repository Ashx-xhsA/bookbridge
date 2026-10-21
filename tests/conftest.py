"""Shared fixtures for the Worker test suite."""

from __future__ import annotations

import pytest

PUBLIC_IP = "104.18.6.192"


@pytest.fixture(autouse=True)
def _hermetic_dns(monkeypatch: pytest.MonkeyPatch) -> None:
    """Every hostname resolves to one public address, so no test hits real DNS.

    Tests of the SSRF guard override this with their own resolver.
    """
    monkeypatch.setattr(
        "bookbridge.harness.providers.url_guard._resolve", lambda host, port: [PUBLIC_IP]
    )
