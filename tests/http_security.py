from __future__ import annotations

import http.client
import os
from pathlib import Path
import socket
import subprocess
import tempfile
import shutil
import sys
import time

ROOT = Path(__file__).resolve().parents[1]


def free_port() -> int:
    with socket.socket() as sock:
        sock.bind(('127.0.0.1', 0))
        return int(sock.getsockname()[1])


def request(port: int, method: str, path: str):
    connection = http.client.HTTPConnection('127.0.0.1', port, timeout=3)
    connection.request(method, path)
    response = connection.getresponse()
    body = response.read()
    headers = {key.lower(): value for key, value in response.getheaders()}
    connection.close()
    return response.status, headers, body


checks: list[tuple[str, bool]] = []


def check(name: str, condition: bool) -> None:
    checks.append((name, bool(condition)))
    if not condition:
        raise AssertionError(name)


port = free_port()
environment = {**os.environ, 'PORT': str(port), 'HOST': '127.0.0.1'}
process = subprocess.Popen(
    ['node', 'serve.mjs'],
    cwd=ROOT,
    env=environment,
    stdout=subprocess.PIPE,
    stderr=subprocess.PIPE,
    text=True,
)

try:
    deadline = time.time() + 5
    while time.time() < deadline:
        try:
            status, _, _ = request(port, 'GET', '/')
            if status == 200:
                break
        except OSError:
            time.sleep(0.05)
    else:
        stdout, stderr = process.communicate(timeout=1)
        raise RuntimeError(f'server did not start: {stdout} {stderr}')

    status, headers, body = request(port, 'GET', '/')
    check('GET index succeeds', status == 200 and b'LASSO' in body)
    check('GET index serves the product claim', b'Draw what your agent can touch' in body)
    check('HTML content type is correct', headers.get('content-type', '').startswith('text/html'))
    check('HTML is never cached', headers.get('cache-control') == 'no-store')
    check('CSP is emitted', "object-src 'none'" in headers.get('content-security-policy', ''))
    check('MIME sniffing is disabled', headers.get('x-content-type-options') == 'nosniff')
    check('referrer is suppressed', headers.get('referrer-policy') == 'no-referrer')
    check('sensitive permissions are disabled', 'camera=()' in headers.get('permissions-policy', ''))
    check('resources are same-origin', headers.get('cross-origin-resource-policy') == 'same-origin')
    check('legacy cross-domain policy files are disabled', headers.get('x-permitted-cross-domain-policies') == 'none')

    status, headers, body = request(port, 'HEAD', '/src/app.js')
    check('HEAD succeeds without body', status == 200 and body == b'')
    check('HEAD preserves positive content length', int(headers.get('content-length', '0')) > 0)
    check('JavaScript content type is correct', headers.get('content-type', '').startswith('text/javascript'))
    check('unversioned runtime assets are not cached', headers.get('cache-control') == 'no-store')
    status, headers, body = request(port, 'POST', '/')
    check('unsupported methods fail closed', status == 405 and headers.get('allow') == 'GET, HEAD')
    check('method rejection response is bounded', len(body) < 128)
    status, _, _ = request(port, 'GET', '/..%2f..%2fetc%2fpasswd')
    check('encoded path traversal is rejected', status == 404)
    status, _, _ = request(port, 'GET', '/%00')
    check('null-byte path is rejected', status == 404)
    status, headers, body = request(port, 'GET', '/' + ('a' * 3_000))
    check('oversized request targets are rejected', status == 414 and body == b'URI too long')
    check('oversized request rejection is never cached', headers.get('cache-control') == 'no-store')
    status, _, body = request(port, 'GET', '/definitely-missing')
    check('missing files return a generic bounded 404', status == 404 and body == b'Not found')
    status, _, body = request(port, 'GET', '/package.json')
    check('server does not expose project metadata', status == 404 and body == b'Not found')
    status, _, body = request(port, 'GET', '/tests/core.test.mjs')
    check('server does not expose tests', status == 404 and body == b'Not found')
    # Exercise realpath containment through an otherwise allow-listed asset in
    # an isolated server copy. This proves the check is not merely the public
    # path allow-list rejecting an unknown filename.
    with tempfile.TemporaryDirectory(prefix='lasso-symlink-probe-') as temp_directory:
        fixture = Path(temp_directory)
        shutil.copy2(ROOT / 'serve.mjs', fixture / 'serve.mjs')
        shutil.copy2(ROOT / 'index.html', fixture / 'index.html')
        (fixture / 'src').mkdir()
        for name in ['app.js', 'core.js', 'scopeCompiler.js', 'webmcp.js']:
            shutil.copy2(ROOT / 'src' / name, fixture / 'src' / name)
        (fixture / 'styles.css').symlink_to('/etc/hosts')

        symlink_port = free_port()
        symlink_environment = {**os.environ, 'PORT': str(symlink_port), 'HOST': '127.0.0.1'}
        symlink_server = subprocess.Popen(
            ['node', 'serve.mjs'],
            cwd=fixture,
            env=symlink_environment,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
        )
        try:
            deadline = time.time() + 5
            while time.time() < deadline:
                try:
                    symlink_status, _, symlink_body = request(symlink_port, 'GET', '/styles.css')
                    break
                except OSError:
                    time.sleep(0.05)
            else:
                raise RuntimeError('isolated symlink-probe server did not start')
            check('allow-listed symlink escape is rejected by realpath containment', symlink_status == 404 and symlink_body == b'Not found')
        finally:
            symlink_server.terminate()
            try:
                symlink_server.wait(timeout=2)
            except subprocess.TimeoutExpired:
                symlink_server.kill()

    invalid_environment = {**os.environ, 'PORT': '70000', 'HOST': '127.0.0.1'}
    invalid = subprocess.run(
        ['node', 'serve.mjs'],
        cwd=ROOT,
        env=invalid_environment,
        capture_output=True,
        text=True,
        timeout=3,
        check=False,
    )
    check('invalid port fails at startup', invalid.returncode != 0 and 'PORT must be an integer' in invalid.stderr)
finally:
    process.terminate()
    try:
        process.wait(timeout=2)
    except subprocess.TimeoutExpired:
        process.kill()

print(f'HTTP_SECURITY_CHECKS={len(checks)}/{len(checks)} PASS')
for name, _ in checks:
    print('PASS |', name)
