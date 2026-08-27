# eduK12 database backup and restore

The supported backup is an encrypted database-only package. It contains a
versioned JSON manifest and a custom-format PostgreSQL dump. The package,
manifest component, plaintext, and encrypted file are all checked before a
backup is marked verified.

## Local development

Set `BACKUP_ENCRYPTION_KEY` in the process environment. The key is required;
the scripts never generate a replacement or write it to a configuration file.
The default local target is the Compose PostgreSQL container
`ptool-postgres`/database `ptool`.

```sh
cd server-version/backend
BACKUP_ENCRYPTION_KEY='set-this-only-in-your-shell' npm run backup:db
BACKUP_ENCRYPTION_KEY='set-this-only-in-your-shell' npm run verify:backup
```

Use a disposable PostgreSQL container for restore verification. The smoke
script creates a container whose name starts with `eduk12-restore-`, restores
only into that container, checks the Prisma migration table and user count,
then removes the container.

```sh
BACKUP_ENCRYPTION_KEY='set-this-only-in-your-shell' \
  npm run smoke:restore -- backups/encrypted/<backup>.edubackup.enc
```

`incremental`/WAL tar backups are intentionally rejected. A future PITR
implementation must use PostgreSQL base backup plus WAL archiving and receive
a separate review.

## Safety rules

- Do not put `BACKUP_ENCRYPTION_KEY` in Git, logs, or an unprotected file.
- Restore requires `RESTORE_CONFIRMATION=RESTORE` and an explicitly named
  disposable PostgreSQL container. PM2, `sudo postgres`, host peer auth, and
  production database targets are not restore paths.
- Temporary plaintext files are created below an OS temporary directory and
  removed on completion or failure.
- Production scheduling, object storage retention, and firewall policy are
  external operations. COS is not required for the local test environment.
