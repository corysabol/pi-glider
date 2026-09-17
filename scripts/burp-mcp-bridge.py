#!/usr/bin/env python3
"""Host-rewriting reverse proxy for the Burp MCP server.

Burp's MCP server rejects any Host header other than localhost/127.0.0.1 (DNS-rebinding
protection). The Docker container reaches the host via host.docker.internal, which Burp
rejects with 403. This bridge listens on all interfaces and forwards to Burp, rewriting
the Host header to 127.0.0.1:<port> on *every* request (not just the first), so HTTP
keep-alive connections work correctly.

Usage:
    python3 scripts/burp-mcp-bridge.py

Environment:
    BRIDGE_LISTEN_HOST  (default 0.0.0.0)
    BRIDGE_LISTEN_PORT  (default 9877)
    BRIDGE_TARGET_HOST  (default 127.0.0.1)
    BRIDGE_TARGET_PORT  (default 9876)
"""
import os
import socket
import threading

LISTEN_HOST = os.environ.get("BRIDGE_LISTEN_HOST", "0.0.0.0")
LISTEN_PORT = int(os.environ.get("BRIDGE_LISTEN_PORT", "9877"))
TARGET_HOST = os.environ.get("BRIDGE_TARGET_HOST", "127.0.0.1")
TARGET_PORT = int(os.environ.get("BRIDGE_TARGET_PORT", "9876"))
TARGET_HOSTPORT = f"{TARGET_HOST}:{TARGET_PORT}"


def read_head(sock: socket.socket) -> bytes:
    """Read bytes until the end of the HTTP head (\\r\\n\\r\\n). Returns b'' on EOF."""
    buf = b""
    while b"\r\n\r\n" not in buf:
        chunk = sock.recv(65536)
        if not chunk:
            return buf
        buf += chunk
    return buf


def read_exact(sock: socket.socket, n: int) -> bytes:
    """Read exactly n bytes (or as many as available before EOF)."""
    data = b""
    while len(data) < n:
        chunk = sock.recv(min(65536, n - len(data)))
        if not chunk:
            break
        data += chunk
    return data


def rewrite_host(head: bytes) -> bytes:
    """Rewrite the Host header in an HTTP/1.1 request head."""
    lines = []
    for line in head.split(b"\r\n"):
        if line.lower().startswith(b"host:"):
            lines.append(f"Host: {TARGET_HOSTPORT}".encode())
        else:
            lines.append(line)
    return b"\r\n".join(lines)


def content_length(head: bytes):
    """Return the Content-Length value from a request head, or None if absent."""
    for line in head.split(b"\r\n"):
        if line.lower().startswith(b"content-length:"):
            try:
                return int(line.split(b":", 1)[1].strip())
            except ValueError:
                return None
    return None


def pump(src, dst):
    """Bidirectional byte pump (used for streaming responses back to the client)."""
    try:
        while True:
            data = src.recv(65536)
            if not data:
                break
            dst.sendall(data)
    except OSError:
        pass
    finally:
        try:
            dst.shutdown(socket.SHUT_WR)
        except OSError:
            pass


def handle(client):
    upstream = None
    try:
        upstream = socket.create_connection((TARGET_HOST, TARGET_PORT))

        # Stream responses (upstream -> client) on a separate thread. This is required
        # for the long-lived SSE stream (GET) and for POST responses while the main
        # loop is reading the next keep-alive request.
        resp_thread = threading.Thread(target=pump, args=(upstream, client), daemon=True)
        resp_thread.start()

        # Read requests one at a time, rewrite Host on each, and forward. Looping here
        # (rather than only handling the first request) is what makes keep-alive work:
        # every POST gets its Host rewritten, not just the first one on a connection.
        while True:
            head = read_head(client)
            if not head:
                break

            head, sep, rest = head.partition(b"\r\n\r\n")
            if not sep:
                # Incomplete head; forward what we have and stop.
                upstream.sendall(head)
                break

            print(f"[burp-mcp-bridge] request:\n{head.decode(errors='replace')[:400]}", flush=True)
            upstream.sendall(rewrite_host(head) + sep)

            # Forward any body bytes already buffered, then the remainder per Content-Length.
            if rest:
                upstream.sendall(rest)

            cl = content_length(head)
            if cl is not None:
                remaining = cl - len(rest)
                if remaining > 0:
                    upstream.sendall(read_exact(client, remaining))
            # If no Content-Length (e.g. GET, or chunked), there is no body to forward;
            # loop to read the next request head.

    except OSError:
        pass
    finally:
        try:
            client.close()
        except OSError:
            pass
        if upstream:
            try:
                upstream.close()
            except OSError:
                pass


def main():
    srv = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    srv.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    srv.bind((LISTEN_HOST, LISTEN_PORT))
    srv.listen(64)
    print(f"[burp-mcp-bridge] {LISTEN_HOST}:{LISTEN_PORT} -> {TARGET_HOSTPORT}", flush=True)
    while True:
        conn, addr = srv.accept()
        print(f"[burp-mcp-bridge] connection from {addr[0]}:{addr[1]}", flush=True)
        threading.Thread(target=handle, args=(conn,), daemon=True).start()


if __name__ == "__main__":
    main()
