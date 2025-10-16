#!/usr/bin/env tsx

import { Command } from "commander";
import { z } from "zod";
import {
  refreshAllFeatures,
  computeChurnFeatures,
  computeUpsellFeatures,
  computeEtaFeatures,
} from "../../server/services/ml/feature-store";

const program = new Command();

const jobSchema = z.enum(["churn", "upsell", "eta", "all"]);

type JobName = z.infer<typeof jobSchema>;

async function run(job: JobName, options: { dryRun?: boolean }) {
  if (job === "all") {
    await refreshAllFeatures({ dryRun: options.dryRun });
    console.info("Refreshed all features (dryRun=%s)", options.dryRun ?? false);
    return;
  }

  const jobMap = {
    churn: computeChurnFeatures,
    upsell: computeUpsellFeatures,
    eta: computeEtaFeatures,
  } as const;

  await jobMap[job]({ dryRun: options.dryRun });
}

program
  .name("train")
  .description("ML training orchestrator placeholder")
  .argument("<job>", "Job to execute (churn|upsell|eta|all)")
  .option("--dry-run", "Skip writing feature values")
  .action(async (job, opts) => {
    const parsed = jobSchema.safeParse(job);
    if (!parsed.success) {
      console.error("Unknown job", job);
      process.exitCode = 1;
      return;
    }

    await run(parsed.data, { dryRun: Boolean(opts.dryRun) });
  });

program.parseAsync().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

