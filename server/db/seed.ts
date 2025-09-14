import 'dotenv/config';
import { db } from './client';

async function main() {
  console.log('Seeding (noop example) ...');
  // await db.insert(users).values({ ... });
  console.log('Seed done.');
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
