import "dotenv/config";
import { fetchAllSuttas, VAGGAS } from "./fetchSuttas";
import { fetchAllMN, VAGGAS_MN } from "./fetchMN";
import { extractAll } from "./extractAdviceUnits";
import { validateUnits, saveReviewQueue } from "./validate";

/**
 * Ingestion pipeline orchestrator.
 *
 * Usage:
 *   npx tsx pipeline/ingest/run.ts                          # Full run AN5 (all vaggas, gpt-4o-mini)
 *   npx tsx pipeline/ingest/run.ts --corpus mn              # Run on MN corpus
 *   npx tsx pipeline/ingest/run.ts --vagga 6                # Single vagga (Hindrances)
 *   npx tsx pipeline/ingest/run.ts --model gpt-4o           # Use gpt-4o for extraction
 *   npx tsx pipeline/ingest/run.ts --dry-run                # Fetch only, no LLM calls
 *   npx tsx pipeline/ingest/run.ts --fetch-only             # Only fetch, skip extraction
 *   npx tsx pipeline/ingest/run.ts --skip-existing          # Skip already-fetched/extracted vaggas
 */

interface PipelineOptions {
  vaggaIndex?: number;
  corpus: "an5" | "mn";
  model: string;
  dryRun: boolean;
  fetchOnly: boolean;
  skipExisting: boolean;
}

function parseArgs(): PipelineOptions {
  const args = process.argv.slice(2);
  const options: PipelineOptions = {
    corpus: "an5",
    model: process.env.EXTRACTION_MODEL || "gpt-4o-mini",
    dryRun: false,
    fetchOnly: false,
    skipExisting: false,
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "--corpus":
        options.corpus = args[++i] as "an5" | "mn";
        break;
      case "--vagga":
        options.vaggaIndex = parseInt(args[++i], 10);
        break;
      case "--model":
        options.model = args[++i];
        break;
      case "--dry-run":
        options.dryRun = true;
        break;
      case "--fetch-only":
        options.fetchOnly = true;
        break;
      case "--skip-existing":
        options.skipExisting = true;
        break;
      case "--help":
        printHelp();
        process.exit(0);
      default:
        console.error(`Unknown argument: ${args[i]}`);
        printHelp();
        process.exit(1);
    }
  }

  return options;
}

function printHelp(): void {
  console.log(`
Monk in Your Pocket — Ingestion Pipeline

Usage: npx tsx pipeline/ingest/run.ts [options]

Options:
  --corpus <name>   Corpus to process: an5 (default) or mn
  --vagga <N>       Run on a single vagga by index
  --model <name>    LLM model for extraction (default: gpt-4o-mini)
  --dry-run         Fetch suttas but skip LLM extraction
  --fetch-only      Only fetch from SuttaCentral, do not extract
  --skip-existing   Skip vaggas that already have output files
  --help            Show this help

AN5 Vaggas (${VAGGAS.length}):
${VAGGAS.map((v, i) => `  ${(i + 1).toString().padStart(2)}) ${v.name} (AN 5.${v.start}–5.${v.end})`).join("\n")}

MN Vaggas (${VAGGAS_MN.length}):
${VAGGAS_MN.map((v, i) => `  ${(i + 1).toString().padStart(2)}) ${v.name} (MN ${v.start}–${v.end})`).join("\n")}

Environment:
  OPENAI_API_KEY       Required for extraction
  EXTRACTION_MODEL     Default model (overridden by --model)
`);
}

function estimateCost(suttaCount: number, model: string): string {
  // Rough estimates based on typical AN5 sutta size
  const avgInputTokens = 800;
  const avgOutputTokens = 600;
  const totalInput = suttaCount * avgInputTokens;
  const totalOutput = suttaCount * avgOutputTokens;

  let inputCostPer1M: number;
  let outputCostPer1M: number;

  switch (model) {
    case "gpt-4o-mini":
      inputCostPer1M = 0.15;
      outputCostPer1M = 0.60;
      break;
    case "gpt-4o":
      inputCostPer1M = 2.50;
      outputCostPer1M = 10.00;
      break;
    default:
      return "(unknown model — cannot estimate)";
  }

  const cost =
    (totalInput / 1_000_000) * inputCostPer1M +
    (totalOutput / 1_000_000) * outputCostPer1M;

  return `~$${cost.toFixed(2)} (${suttaCount} suttas × ${model})`;
}

async function main(): Promise<void> {
  const options = parseArgs();

  const isAN5 = options.corpus === "an5";
  const vaggas = isAN5 ? VAGGAS : VAGGAS_MN;

  console.log("═══════════════════════════════════════════");
  console.log("  Monk in Your Pocket — Ingestion Pipeline");
  console.log("═══════════════════════════════════════════");
  console.log(`  Corpus:        ${options.corpus.toUpperCase()}`);
  console.log(`  Model:         ${options.model}`);
  console.log(`  Dry run:       ${options.dryRun}`);
  console.log(`  Fetch only:    ${options.fetchOnly}`);
  console.log(`  Skip existing: ${options.skipExisting}`);

  if (options.vaggaIndex) {
    const v = vaggas[options.vaggaIndex - 1];
    if (!v) {
      console.error(`\n✗ Invalid vagga index: ${options.vaggaIndex}. Valid range: 1-${vaggas.length}`);
      process.exit(1);
    }
    console.log(`  Target:        Vagga ${options.vaggaIndex} — ${v.name}`);
  } else {
    console.log(`  Target:        All ${vaggas.length} vaggas`);
  }

  // Estimate cost
  const targetVaggas = options.vaggaIndex
    ? [vaggas[options.vaggaIndex - 1]]
    : vaggas;
  const suttaCount = targetVaggas.reduce((sum, v) => sum + (v.end - v.start + 1), 0);

  if (!options.dryRun && !options.fetchOnly) {
    console.log(`  Est. cost:     ${estimateCost(suttaCount, options.model)}`);
  }

  console.log("═══════════════════════════════════════════\n");

  // Step 1: Fetch
  console.log("📥 STEP 1: Fetching suttas from SuttaCentral...");
  if (isAN5) {
    await fetchAllSuttas({
      vaggaIndex: options.vaggaIndex,
      skipExisting: options.skipExisting,
    });
  } else {
    await fetchAllMN({
      vaggaIndex: options.vaggaIndex,
      skipExisting: options.skipExisting,
    });
  }

  if (options.fetchOnly) {
    console.log("\n✅ Fetch complete. Skipping extraction (--fetch-only).");
    return;
  }

  // Step 2: Extract
  console.log("\n🔍 STEP 2: Extracting AdviceUnits...");

  if (!process.env.OPENAI_API_KEY && !options.dryRun) {
    console.error("\n✗ OPENAI_API_KEY not set. Set it in .env or export it.");
    process.exit(1);
  }

  const vaggaSlugs = targetVaggas.map((v) => v.slug);
  const corpusDir = isAN5 ? "an5" : "mn";
  const units = await extractAll(options.model, vaggaSlugs, corpusDir, {
    skipExisting: options.skipExisting,
    dryRun: options.dryRun,
  });

  if (options.dryRun || units.length === 0) {
    console.log("\n✅ Pipeline complete (dry run or no units extracted).");
    return;
  }

  // Step 3: Validate
  console.log("\n✔ STEP 3: Validating extracted units...");
  const { valid, flagged, rejected } = validateUnits(units);

  console.log(`\n  ✓ Valid:    ${valid.length}`);
  console.log(`  ⚠ Flagged:  ${flagged.length}`);
  console.log(`  ✗ Rejected: ${rejected.length}`);

  // Save review queue
  if (flagged.length > 0 || rejected.length > 0) {
    saveReviewQueue(flagged, rejected);
  }

  console.log("\n═══════════════════════════════════════════");
  console.log("  ✅ Pipeline complete!");
  console.log(`  ${valid.length} valid units ready in data/generated/an5/`);
  if (flagged.length > 0) {
    console.log(`  ${flagged.length} units need review in data/review/review-queue.json`);
  }
  console.log("═══════════════════════════════════════════");
}

main().catch((error) => {
  console.error("\n✗ Pipeline failed:", error);
  process.exit(1);
});
