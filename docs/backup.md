# Database Backup Procedures

## Database Configuration
Set the `DATABASE_URL` environment variable to your PostgreSQL connection string, such as:
`postgresql://user:password@ep-example-123456.us-east-1.aws.neon.tech/neondb?sslmode=require`.

## Frequency
Nightly at 02:00 UTC via a cron job on the server.

Example cron entry:

```
0 2 * * * /path/to/repo/scripts/db-backup.sh
```

## Storage Location
Backups are uploaded to the cloud bucket specified by the `BACKUP_BUCKET` environment variable (e.g., `s3://my-bucket/flutterpos`).

## Restore Steps
1. Download the desired `*.sql.gz` file from cloud storage.
2. Decompress the file: `gunzip backup.sql.gz`.
3. Restore to the target database: `psql "$DATABASE_URL" < backup.sql`.

## Verification in Staging
1. Weekly, restore the latest backup to the staging database using the steps above.
2. Run application tests with `npm test` to confirm the data loads and migrations succeed.
3. Remove the staging database after verification.
