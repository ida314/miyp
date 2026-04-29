import { mkdirSync, writeFileSync, existsSync, readFileSync } from "fs";
import { join } from "path";
import OpenAI from "openai";
import { RawSutta } from "./fetchSuttas";
import { AdviceUnit } from "../../src/types/adviceUnit";

const EMBEDDINGS_PATH = join(__dirname, "../../data/embeddings.json");

function loadEmbeddings(): Record<string, number[]> {
  if (!existsSync(EMBEDDINGS_PATH)) return {};
  try {
    return JSON.parse(readFileSync(EMBEDDINGS_PATH, "utf-8")) as Record<string, number[]>;
  } catch {
    return {};
  }
}

function saveEmbeddings(store: Record<string, number[]>): void {
  mkdirSync(join(__dirname, "../../data"), { recursive: true });
  writeFileSync(EMBEDDINGS_PATH, JSON.stringify(store), "utf-8");
}

async function embedUnit(unit: AdviceUnit): Promise<number[]> {
  const text = [unit.problem_summary, unit.diagnosis, unit.teaching, ...unit.practice_actions]
    .join(" ")
    .slice(0, 8000);
  const response = await getClient().embeddings.create({
    model: "text-embedding-3-small",
    input: text,
  });
  return response.data[0].embedding;
}

function makeExtractionPrompt(corpusLabel: string, exampleRef: string): string {
  return `You are extracting structured advice units from an early Buddhist sutta (Bhikkhu Sujato translation from SuttaCentral).

Analyze the sutta passage below and extract 0 to 3 AdviceUnits. Each AdviceUnit captures practical guidance that could help a modern layperson.

Rules:
- Return an empty array [] if the sutta has NO practical teaching for laypeople (e.g., purely cosmological, genealogical, monastic-rule-only, or heavily repetitive with no new content).
- The "problem_summary" should describe the kind of human problem this teaching addresses, in modern language.
- "buddhist_labels" must be from this set: ["craving_attachment", "aversion_anger", "delusion_confusion", "grief_loss", "fear_anxiety", "restlessness_distraction", "doubt_indecision", "ethical_conflict", "speech_relationships", "discipline_habit_formation"].
- "practice_actions" should be concrete, doable steps a modern person can try.
- "confidence" should reflect how clearly the source text supports your extraction (0.0 to 1.0). Use lower values (< 0.7) when you're stretching the interpretation.
- "audience" should almost always be "lay" for this project.
- Keep canonical_passage to 1-3 key sentences from the source, not the entire text.
- This is a ${corpusLabel} sutta. Use the format "${exampleRef}" for source_ref.

Output a JSON object: { "advice_units": [...] }

Each unit in the array:
{
  "source_ref": "${exampleRef}",
  "canonical_passage": "...",
  "context_summary": "...",
  "problem_summary": "...",
  "buddhist_labels": [...],
  "diagnosis": "...",
  "teaching": "...",
  "practice_actions": ["..."],
  "audience": "lay" | "monastic" | "general",
  "confidence": 0.XX
}`;
}

interface ExtractionResult {
  advice_units: Omit<AdviceUnit, "id" | "source_collection" | "translator" | "review_status">[];
}

let client: OpenAI | null = null;
function getClient(): OpenAI {
  if (!client) {
    client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return client;
}

const CORPUS_META: Record<string, { label: string; collection: "AN" | "MN" | "SN"; exampleRef: string }> = {
  an5: { label: "AN (Aṅguttara Nikāya)", collection: "AN", exampleRef: "AN 5.XX" },
  mn:  { label: "MN (Majjhima Nikāya)",  collection: "MN", exampleRef: "MN XX"   },
  sn:  { label: "SN (Saṁyutta Nikāya)",  collection: "SN", exampleRef: "SN XX.XX" },
};

/**
 * Extract AdviceUnits from a single sutta using the LLM.
 */
async function extractFromSutta(
  sutta: RawSutta,
  model: string,
  corpusDir: string
): Promise<AdviceUnit[]> {
  const meta = CORPUS_META[corpusDir] ?? CORPUS_META["an5"];
  const prompt = makeExtractionPrompt(meta.label, meta.exampleRef);

  const userMessage = `Sutta: ${sutta.uid} — "${sutta.title}"

Full translation text:
${sutta.translation_text}`;

  try {
    const response = await getClient().chat.completions.create({
      model,
      temperature: 0.2,
      max_tokens: 2048,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: prompt },
        { role: "user", content: userMessage },
      ],
    });

    const content = response.choices[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(content) as ExtractionResult;
    const rawUnits = parsed.advice_units || [];

    // Add metadata fields
    return rawUnits.map((unit, idx) => ({
      ...unit,
      id: `au_${sutta.uid.replace(/\./g, "_")}_${idx + 1}`,
      source_collection: meta.collection,
      translator: "Bhikkhu Sujato",
      review_status: "auto" as const,
    }));
  } catch (error) {
    console.error(`  ✗ Extraction failed for ${sutta.uid}:`, error instanceof Error ? error.message : error);
    throw error;
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Extract AdviceUnits from all suttas in a vagga.
 */
export async function extractVagga(
  vaggaSlug: string,
  model: string,
  corpusDir: string = "an5",
  options: { skipExisting?: boolean; dryRun?: boolean } = {}
): Promise<AdviceUnit[]> {
  const generatedDir = join(__dirname, `../../data/generated/${corpusDir}`);
  const sourcePath = join(__dirname, `../../data/sources/${corpusDir}`, `${vaggaSlug}.json`);
  const outPath = join(generatedDir, `${vaggaSlug}.json`);

  if (!existsSync(sourcePath)) {
    console.error(`  ✗ Source file not found: ${vaggaSlug}.json — run fetch first`);
    return [];
  }

  if (options.skipExisting && existsSync(outPath)) {
    console.log(`⏭ Skipping extraction for ${vaggaSlug} (already exists)`);
    return JSON.parse(readFileSync(outPath, "utf-8")) as AdviceUnit[];
  }

  const suttas = JSON.parse(readFileSync(sourcePath, "utf-8")) as RawSutta[];
  console.log(`\n🔍 Extracting from ${vaggaSlug} (${suttas.length} suttas, model: ${model})`);

  if (options.dryRun) {
    console.log("  🏜 Dry run — skipping LLM calls");
    return [];
  }

  const allUnits: AdviceUnit[] = [];

  for (const sutta of suttas) {
    process.stdout.write(`  ${sutta.uid} "${sutta.title}"... `);

    const units = await extractFromSutta(sutta, model, corpusDir);

    if (units.length === 0) {
      console.log("→ 0 units (no practical teaching)");
    } else {
      console.log(`→ ${units.length} unit(s)`);
      allUnits.push(...units);
    }

    // Rate limit
    await delay(500);
  }

  // Compute embeddings
  if (allUnits.length > 0) {
    console.log(`  🧮 Computing embeddings for ${allUnits.length} units...`);
    const embedStore = loadEmbeddings();
    for (const unit of allUnits) {
      try {
        embedStore[unit.id] = await embedUnit(unit);
        await delay(200);
      } catch (error) {
        console.warn(`  ⚠ Embedding failed for ${unit.id}:`, error instanceof Error ? error.message : error);
      }
    }
    saveEmbeddings(embedStore);
    console.log(`  💾 Saved embeddings to data/embeddings.json`);
  }

  // Save
  mkdirSync(generatedDir, { recursive: true });
  writeFileSync(outPath, JSON.stringify(allUnits, null, 2), "utf-8");
  console.log(`  💾 Saved ${allUnits.length} units to ${vaggaSlug}.json`);

  return allUnits;
}

/**
 * Extract from all vagga source files.
 */
export async function extractAll(
  model: string,
  vaggaSlugs: string[],
  corpusDir: string = "an5",
  options: { skipExisting?: boolean; dryRun?: boolean } = {}
): Promise<AdviceUnit[]> {
  const allUnits: AdviceUnit[] = [];

  for (const slug of vaggaSlugs) {
    const units = await extractVagga(slug, model, corpusDir, options);
    allUnits.push(...units);
  }

  console.log(`\n✅ Extracted ${allUnits.length} total advice units`);
  return allUnits;
}
