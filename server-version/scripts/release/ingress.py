"""Validate complete HTTPS candidates; never write live config or reload services."""
import argparse
from pathlib import Path
import re
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[2] / 'ops/nginx'
INCLUDES = {'eduk12-products.conf', 'eduk12-school.conf'}
HOST_CERTS = {'eduk12.top': 'eduk12.top', 'www.eduk12.top': 'eduk12.top',
              'api.eduk12.top': 'api.eduk12.top', 'training.eduk12.top': 'training.eduk12.top',
              'teacher.eduk12.top': 'eduk12-products', 'survey.eduk12.top': 'eduk12-products',
              'school.eduk12.top': 'school.eduk12.top'}


def server_blocks(text):
    text = re.sub(r'#.*', '', text)
    output = []
    for m in re.finditer(r'\bserver\s*\{', text):
        level = 1; pos = m.end()
        while pos < len(text) and level:
            if text[pos] == '{': level += 1
            elif text[pos] == '}': level -= 1
            pos += 1
        if level: raise ValueError('Unclosed server block')
        output.append(text[m.end():pos-1])
    return output


def https_hosts(text):
    result = {}
    for block in server_blocks(text):
        if not re.search(r'\blisten\s+(?:\[[^\]]+\]:|[^;\s]+:)?443\s+ssl\b', block): continue
        names = re.search(r'\bserver_name\s+([^;]+);', block)
        cert = re.search(r'\bssl_certificate\s+([^;]+);', block)
        key = re.search(r'\bssl_certificate_key\s+([^;]+);', block)
        if not names or not cert or not key: raise ValueError('Incomplete HTTPS server')
        for name in names[1].split():
            if name in result: raise ValueError('Duplicate HTTPS host: ' + name)
            result[name] = (cert[1].strip(), key[1].strip())
    return result


def bundle(root):
    main = (root / 'nginx.production.conf').read_text()
    parts = [main]
    for name in sorted(INCLUDES):
        directive = 'include /etc/nginx/conf.d/' + name + ';'
        if main.count(directive) != 1: raise ValueError('Required include missing or duplicated: ' + name)
        file = root / name
        if file.is_symlink() or not file.is_file(): raise ValueError('Regular included config required')
        parts.append(file.read_text())
    return '\n'.join(parts)


def validate(root, existing_text=None):
    root = Path(root)
    text = bundle(root); hosts = https_hosts(text)
    for host, lineage in HOST_CERTS.items():
        expected = ('/etc/letsencrypt/live/' + lineage + '/fullchain.pem', '/etc/letsencrypt/live/' + lineage + '/privkey.pem')
        if hosts.get(host) != expected: raise ValueError('Missing or wrong certificate binding: ' + host)
    if existing_text is not None:
        for host, binding in https_hosts(existing_text).items():
            if hosts.get(host) != binding: raise ValueError('Existing HTTPS host/certificate lost: ' + host)
    for block in server_blocks(text):
        if 'proxy_pass' in block and 'proxy_set_header Host $host;' not in block:
            raise ValueError('Product host identity must be preserved')
    school = (root / 'eduk12-school.conf').read_text()
    if 'location ^~ /.well-known/acme-challenge/' not in school or '/var/www/eduk12-school-acme' not in school:
        raise ValueError('School renewal route missing')
    hook = (root / 'renew-school.sh').read_text()
    for marker in ['RENEWED_LINEAGE', '/etc/letsencrypt/live/school.eduk12.top', '/usr/sbin/nginx -t', '/bin/systemctl reload nginx']:
        if marker not in hook: raise ValueError('School renewal hook missing')
    if re.search(r'\b(restart|stop)\b', hook): raise ValueError('Renewal must only reload nginx')
    return sorted(hosts)


def synthetic_config(root, tmp, cert, key):
    main = (Path(root) / 'nginx.production.conf').read_text()
    for name in sorted(INCLUDES):
        main = main.replace('include /etc/nginx/conf.d/' + name + ';', (Path(root) / name).read_text())
    main = re.sub(r'/etc/letsencrypt/live/[^;\s]+/fullchain.pem', str(cert), main)
    main = re.sub(r'/etc/letsencrypt/live/[^;\s]+/privkey.pem', str(key), main)
    main = main.replace('/var/log/nginx/eduk12-timing.log', str(tmp / 'access.log'))
    temps = ''.join(kind + '_temp_path ' + str(tmp / kind) + ';\n' for kind in ['client_body', 'proxy', 'fastcgi', 'uwsgi', 'scgi'])
    main = main.replace('http {', 'http {\n' + temps, 1)
    # nginx -t also opens listening sockets. Preserve virtual-host/SSL grammar
    # while keeping the synthetic job away from privileged and public ports.
    main = re.sub(r'\blisten\s+80\s*;', 'listen 127.0.0.1:31880;', main)
    main = re.sub(r'\blisten\s+443\s+ssl\b', 'listen 127.0.0.1:31443 ssl', main)
    return 'pid ' + str(tmp / 'nginx.pid') + ';\nerror_log stderr;\n' + main


def syntax(root):
    # No live-host requests, production private keys, or service reloads.
    validate(root)
    with tempfile.TemporaryDirectory(prefix='eduk12-ingress-') as tmp:
        tmp = Path(tmp); cert = tmp / 'cert.pem'; key = tmp / 'key.pem'
        subprocess.run(['openssl', 'req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1',
                        '-subj', '/CN=synthetic.ingress.invalid', '-keyout', str(key), '-out', str(cert)], check=True, capture_output=True)
        path = tmp / 'nginx.conf'; path.write_text(synthetic_config(root, tmp, cert, key))
        help_text = subprocess.run(['nginx', '-h'], capture_output=True).stderr
        bootstrap = ['-e', 'stderr'] if b'-e filename' in help_text else []
        result = subprocess.run(['nginx', *bootstrap, '-t', '-p', str(tmp) + '/', '-c', str(path)], capture_output=True, text=True)
        if result.returncode:
            raise RuntimeError('Isolated nginx configuration failed: ' + result.stderr.strip())


if __name__ == '__main__':
    p = argparse.ArgumentParser(); p.add_argument('--root', default=str(ROOT)); p.add_argument('--existing', type=Path); p.add_argument('--syntax', action='store_true'); a = p.parse_args()
    hosts = validate(a.root, a.existing.read_text() if a.existing else None)
    if a.syntax: syntax(a.root)
    print('HTTPS_BUNDLE_OK ' + ','.join(hosts))
