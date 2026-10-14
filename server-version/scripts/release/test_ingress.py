import tempfile
from pathlib import Path
import shutil
import unittest
from ingress import ROOT, bundle, validate


class IngressTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(); self.root = Path(self.temp.name)
        for file in ['nginx.production.conf','eduk12-products.conf','eduk12-school.conf','renew-school.sh']:
            shutil.copyfile(ROOT / file, self.root / file)
    def tearDown(self): self.temp.cleanup()
    def replace(self,file,old,new):
        p=self.root/file;p.write_text(p.read_text().replace(old,new))
    def test_all_current_hosts_and_existing_bindings_preserved(self):
        self.assertEqual(len(validate(self.root, bundle(ROOT))),7)
    def test_missing_include_and_certificate_cannot_pass(self):
        for name in ['eduk12-school.conf','eduk12-products.conf']:
            with self.subTest(name=name):
                text=(self.root/'nginx.production.conf').read_text()
                self.replace('nginx.production.conf','include /etc/nginx/conf.d/'+name+';','')
                with self.assertRaises(ValueError):validate(self.root)
                (self.root/'nginx.production.conf').write_text(text)
        self.replace('eduk12-school.conf','/live/school.eduk12.top/','/live/eduk12.top/')
        with self.assertRaises(ValueError):validate(self.root)
    def test_unknown_existing_host_cannot_be_silently_dropped(self):
        existing=bundle(ROOT)+'\nserver { listen 443 ssl; server_name future.eduk12.top; ssl_certificate /future/fullchain.pem; ssl_certificate_key /future/privkey.pem; }'
        with self.assertRaisesRegex(ValueError,'Existing HTTPS'):validate(self.root,existing)
    def test_host_rewrite_symlink_and_broken_renewal_refused(self):
        self.replace('eduk12-school.conf','proxy_set_header Host $host;','proxy_set_header Host eduk12.top;')
        with self.assertRaises(ValueError):validate(self.root)
        shutil.copyfile(ROOT/'eduk12-school.conf',self.root/'eduk12-school.conf')
        self.replace('renew-school.sh','systemctl reload','systemctl restart')
        with self.assertRaises(ValueError):validate(self.root)
        (self.root/'eduk12-products.conf').unlink();(self.root/'eduk12-products.conf').symlink_to(ROOT/'eduk12-products.conf')
        with self.assertRaises(ValueError):validate(self.root)

if __name__=='__main__':unittest.main()
