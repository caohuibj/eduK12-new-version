"""Disposable loopback TLS ingress and browser-only trust for Training CI.

No system trust/hosts changes, no ignored certificate errors, no Origin rewrite.
Only the already-approved isolated products fixture may invoke this wrapper.
"""
import http.client
import os
from pathlib import Path
import shutil
import signal
import ssl
import subprocess
import tempfile
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

HOST = 'training.eduk12.top'
PORT = 5443
ORIGIN = f'https://{HOST}:{PORT}'
HOP = {'connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization',
       'te', 'trailer', 'transfer-encoding', 'upgrade'}


class Ingress(BaseHTTPRequestHandler):
    def log_message(self, *_args):
        pass  # Do not persist request URLs, cookies or credentials.

    def proxy(self):
        if self.headers.get('Host') != f'{HOST}:{PORT}' or not self.path.startswith('/') or self.path.startswith('//'):
            self.send_error(400)
            return
        length = int(self.headers.get('Content-Length', '0'))
        if length < 0 or length > 1024 * 1024:
            self.send_error(413)
            return
        upstream = 3000 if self.path.startswith(('/api/', '/socket.io/')) else 5173
        connection = http.client.HTTPConnection('127.0.0.1', upstream, timeout=20)
        try:
            headers = {k: v for k, v in self.headers.items() if k.lower() not in HOP}
            headers['Accept-Encoding'] = 'identity'
            # The browser's actual HTTPS Origin and Cookie/CSRF remain unchanged.
            connection.request(self.command, self.path, self.rfile.read(length), headers)
            response = connection.getresponse()
            body = response.read(32 * 1024 * 1024 + 1)
            if len(body) > 32 * 1024 * 1024:
                raise ValueError('Fixture response size limit')
            self.send_response(response.status)
            for key, value in response.getheaders():
                if key.lower() not in HOP | {'content-length'}:
                    self.send_header(key, value)
            self.send_header('Content-Length', str(len(body)))
            self.end_headers()
            if self.command != 'HEAD':
                self.wfile.write(body)
        finally:
            connection.close()

    do_GET = do_HEAD = do_POST = do_PUT = do_PATCH = do_DELETE = do_OPTIONS = proxy


def main():
    assert os.environ.get('NODE_ENV') == 'test'
    assert os.environ.get('QUESTIONNAIRE_PRODUCT_ISOLATED_DB') == '1'
    assert os.environ.get('DATABASE_URL') == os.environ.get('QUESTIONNAIRE_PRODUCT_TEST_DATABASE_URL')
    assert os.environ.get('TRAINING_OPTIONAL_EPHEMERAL_CA_APPROVED') == 'true'
    assert os.environ.get('CORS_ORIGIN') == ORIGIN
    assert os.environ.get('COOKIE_SECURE') == 'true'
    assert shutil.which('certutil'), 'Install official libnss3-tools before running'
    browser = None
    temporary = tempfile.TemporaryDirectory(prefix='training-browser-private-')
    directory = temporary.name
    try:
        root = Path(directory)
        home = root / 'home'
        nss = home / '.pki' / 'nssdb'
        nss.mkdir(parents=True, mode=0o700)
        def run(*args):
            subprocess.run(args, cwd=root, check=True, timeout=30, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        run('openssl', 'req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1', '-keyout', 'ca.key', '-out', 'ca.crt', '-subj', '/CN=Training disposable browser CI')
        run('openssl', 'req', '-newkey', 'rsa:2048', '-nodes', '-keyout', 'site.key', '-out', 'site.csr', '-subj', f'/CN={HOST}')
        (root / 'ext.cnf').write_text(f'subjectAltName=DNS:{HOST}\n')
        run('openssl', 'x509', '-req', '-in', 'site.csr', '-CA', 'ca.crt', '-CAkey', 'ca.key', '-CAcreateserial', '-out', 'site.crt', '-days', '1', '-extfile', 'ext.cnf')
        run('certutil', '-N', '-d', 'sql:' + str(nss), '--empty-password')
        run('certutil', '-A', '-n', 'training-disposable-ci', '-t', 'C,,', '-i', str(root / 'ca.crt'), '-d', 'sql:' + str(nss))
        context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
        context.minimum_version = ssl.TLSVersion.TLSv1_2
        context.load_cert_chain(root / 'site.crt', root / 'site.key')
        server = ThreadingHTTPServer(('127.0.0.1', PORT), Ingress)
        server.daemon_threads = True
        server.socket = context.wrap_socket(server.socket, server_side=True)
        threading.Thread(target=server.serve_forever, daemon=True).start()
        try:
            browser = subprocess.Popen(['node', 'e2e/training-optional-form-browser.cjs'], env={**os.environ, 'HOME': str(home)}, start_new_session=True)
            code = browser.wait(timeout=240)
            if code:
                raise RuntimeError(f'Training browser failed with exit {code}')
        finally:
            if browser and browser.poll() is None:
                os.killpg(browser.pid, signal.SIGTERM)
                try:
                    browser.wait(timeout=10)
                except subprocess.TimeoutExpired:
                    os.killpg(browser.pid, signal.SIGKILL)
                    browser.wait(timeout=10)
            server.shutdown()
            server.server_close()
    finally:
        temporary.cleanup()
        assert not Path(directory).exists(), 'Disposable browser trust cleanup failed'
        print('Disposable Training HTTPS ingress and browser trust cleaned up', flush=True)


def terminate(*_args):
    raise SystemExit(143)


if __name__ == '__main__':
    signal.signal(signal.SIGTERM, terminate)
    main()
