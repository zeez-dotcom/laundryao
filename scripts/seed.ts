import seedBranches from "../server/seed-branches";
import { seedSuperAdmin } from "../server/seed-superadmin";
import seedPackages from "../server/seed-packages";
import { seedProducts } from "../server/seed-products";

async function run() {
  const seeds = [
    { name: "branches", fn: seedBranches },
    { name: "super admin", fn: seedSuperAdmin },
    { name: "packages", fn: seedPackages },
    { name: "products", fn: seedProducts },
  ];

  let failed = false;

  for (const { name, fn } of seeds) {
    try {
      await fn();
      console.log(`Seeded ${name}`);
    } catch (err) {
      failed = true;
      console.error(`Failed to seed ${name}`, err);
    }
  }

  if (failed) {
    process.exit(1);
  }
}

run().catch((err) => {
  console.error('Unexpected error during seeding', err);
  process.exit(1);
});
