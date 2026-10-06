import fs from 'node:fs';
import { encryptStream, verifyEncrypted } from '../attachment-backup/core.mjs';

process.umask(0o077);
try {
  const input = JSON.parse(fs.readFileSync(0, 'utf8'));
  if (typeof input.secret !== 'string' || input.secret.length < 32) throw Error('KEY_REQUIRED');
  if (process.argv[2] === 'encrypt') {
    const result = await encryptStream(fs.createReadStream(input.file), input.output, input.secret, 'host-backups-v1', 32 * 1024 ** 2);
    console.log(JSON.stringify(result));
  } else if (process.argv[2] === 'verify') {
    console.log(JSON.stringify(await verifyEncrypted(input.file, input.receipt, input.secret, 'host-backups-v1')));
  } else throw Error('COMMAND_REQUIRED');
} catch {
  console.error('HOST_BACKUP_CRYPTO_FAILED');
  process.exitCode = 1;
}
