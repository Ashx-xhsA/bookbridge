"""SSRF guard for user-supplied LLM base URLs (OWASP A10).

The BFF validates the URL when the user saves it; the Worker re-checks right
before every call because DNS can change in between. A URL must be https, carry
no credentials, and every address its host resolves to must be public.
Set LLM_ALLOW_PRIVATE_BASE_URL=1 only for local development (e.g. Ollama).
"""

from __future__ import annotations

import ipaddress
import os
import socket
from urllib.parse import urlsplit

_BLOCKED_NETWORKS = tuple(
    ipaddress.ip_network(net)
    for net in (
        "0.0.0.0/8",  # "this network"
        "10.0.0.0/8",
        "100.64.0.0/10",  # carrier-grade NAT, incl. Alibaba Cloud metadata
        "127.0.0.0/8",
        "169.254.0.0/16",  # link-local, incl. AWS/GCP/Azure metadata
        "172.16.0.0/12",
        "192.168.0.0/16",
        "224.0.0.0/4",  # multicast
        "240.0.0.0/4",  # reserved + broadcast
        "::/128",
        "::1/128",
        "64:ff9b::/96",  # NAT64
        "fc00::/7",
        "fe80::/10",
        "ff00::/8",
    )
)


class UnsafeBaseURLError(ValueError):
    """The base URL is not a public https endpoint. Never echoes the URL."""

    def __init__(self) -> None:
        super().__init__("LLM base URL not allowed")


def is_blocked_address(ip: str) -> bool:
    """True for anything that is not a public unicast IP (non-IPs included)."""
    try:
        addr = ipaddress.ip_address(ip)
    except ValueError:
        return True
    if isinstance(addr, ipaddress.IPv6Address) and addr.ipv4_mapped:
        addr = addr.ipv4_mapped
    return any(addr in net for net in _BLOCKED_NETWORKS if net.version == addr.version)


def _resolve(host: str, port: int) -> list[str]:
    infos = socket.getaddrinfo(host, port, proto=socket.IPPROTO_TCP)
    return [str(info[4][0]) for info in infos]


def _private_allowed() -> bool:
    return os.environ.get("LLM_ALLOW_PRIVATE_BASE_URL", "").strip() == "1"


def validate_base_url(url: str, *, resolve: bool = True) -> None:
    """Raise UnsafeBaseURLError unless `url` is a public https endpoint.

    With resolve=False only the URL itself is checked (scheme, credentials,
    literal IPs); the DNS check then happens at call time.
    """
    if _private_allowed():
        if urlsplit(url).scheme not in ("http", "https"):
            raise UnsafeBaseURLError()
        return
    parts = urlsplit(url)
    host = parts.hostname
    if parts.scheme != "https" or not host or parts.username or parts.password:
        raise UnsafeBaseURLError()
    try:
        ipaddress.ip_address(host)
    except ValueError:
        pass  # a hostname, checked via DNS below
    else:
        if is_blocked_address(host):
            raise UnsafeBaseURLError()
        return
    if not resolve:
        return
    try:
        addresses = _resolve(host, parts.port or 443)
    except (OSError, ValueError) as exc:  # NXDOMAIN, bad port, bad IDNA
        raise UnsafeBaseURLError() from exc
    if not addresses or any(is_blocked_address(a) for a in addresses):
        raise UnsafeBaseURLError()
