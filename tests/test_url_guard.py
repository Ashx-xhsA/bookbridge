"""SSRF guard for user-supplied LLM base URLs (OWASP A10).

The BFF already validates the URL when it is saved; the Worker checks again
right before each call, because DNS can change between save and use.
"""

from __future__ import annotations

import pytest

from bookbridge.harness.providers import url_guard
from bookbridge.harness.providers.url_guard import (
    UnsafeBaseURLError,
    is_blocked_address,
    validate_base_url,
)


def _resolves_to(monkeypatch: pytest.MonkeyPatch, *ips: str) -> None:
    monkeypatch.setattr(url_guard, "_resolve", lambda host, port: list(ips))


@pytest.mark.parametrize(
    "ip",
    [
        "10.0.0.1",
        "172.16.0.1",
        "172.31.255.255",
        "192.168.1.1",
        "127.0.0.1",
        "169.254.169.254",
        "0.0.0.0",
        "100.100.100.200",
        "::1",
        "::",
        "fc00::1",
        "fd12:3456::1",
        "fe80::1",
        "::ffff:127.0.0.1",
        "::ffff:169.254.169.254",
        "not-an-ip",
    ],
)
def test_blocks_non_public_addresses(ip: str) -> None:
    assert is_blocked_address(ip)


@pytest.mark.parametrize("ip", ["104.18.6.192", "8.8.8.8", "172.32.0.1", "2606:4700::6810:6c0"])
def test_allows_public_addresses(ip: str) -> None:
    assert not is_blocked_address(ip)


def test_public_https_url_passes() -> None:
    validate_base_url("https://api.deepseek.com/v1")


@pytest.mark.parametrize(
    "url",
    [
        "http://api.example.com/v1",
        "ftp://api.example.com/v1",
        "file:///etc/passwd",
        "https:///v1",
        "https://user:pass@api.example.com/v1",
        "https://169.254.169.254/latest",
        "https://[::1]/v1",
    ],
)
def test_rejects_unsafe_urls(url: str) -> None:
    with pytest.raises(UnsafeBaseURLError):
        validate_base_url(url)


@pytest.mark.parametrize("ip", ["10.1.2.3", "127.0.0.1", "169.254.169.254", "fd00::1"])
def test_rejects_hosts_resolving_to_private_ranges(
    monkeypatch: pytest.MonkeyPatch, ip: str
) -> None:
    _resolves_to(monkeypatch, ip)
    with pytest.raises(UnsafeBaseURLError):
        validate_base_url("https://rebind.example/v1")


def test_rejects_when_any_resolved_address_is_private(monkeypatch: pytest.MonkeyPatch) -> None:
    _resolves_to(monkeypatch, "104.18.6.192", "10.0.0.5")
    with pytest.raises(UnsafeBaseURLError):
        validate_base_url("https://mixed.example/v1")


def test_rejects_unresolvable_host(monkeypatch: pytest.MonkeyPatch) -> None:
    def fail(host: str, port: int) -> list[str]:
        raise OSError("nodename nor servname provided")

    monkeypatch.setattr(url_guard, "_resolve", fail)
    with pytest.raises(UnsafeBaseURLError):
        validate_base_url("https://nope.invalid/v1")


def test_resolve_false_skips_dns(monkeypatch: pytest.MonkeyPatch) -> None:
    _resolves_to(monkeypatch, "10.0.0.1")
    validate_base_url("https://internal.example/v1", resolve=False)


def test_error_message_does_not_echo_the_url() -> None:
    with pytest.raises(UnsafeBaseURLError) as exc:
        validate_base_url("http://secret-host.internal/v1")
    assert "secret-host" not in str(exc.value)


def test_dev_override_allows_private_hosts(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("LLM_ALLOW_PRIVATE_BASE_URL", "1")
    _resolves_to(monkeypatch, "127.0.0.1")
    validate_base_url("http://localhost:11434/v1")
