import { mkdirSync, writeFileSync, existsSync, readFileSync } from "fs";
import { join } from "path";

const BASE_URL = "https://suttacentral.net/api";
const DATA_DIR = join(__dirname, "../../data/sources/mn");

/**
 * MN vagga definitions. Each vagga covers a range of MN suttas.
 * All 152 suttas, 15 vaggas.
 */
export const VAGGAS_MN = [
  { slug: "mn-vagga-01-mulapariyaya", name: "Root of All Things", start: 1, end: 10 },
  { slug: "mn-vagga-02-sihanada", name: "The Lion's Roar", start: 11, end: 20 },
  { slug: "mn-vagga-03-opamma", name: "Similes", start: 21, end: 30 },
  { slug: "mn-vagga-04-mahayamaka", name: "The Longer Pair", start: 31, end: 40 },
  { slug: "mn-vagga-05-culayamaka", name: "The Shorter Pair", start: 41, end: 50 },
  { slug: "mn-vagga-06-gahapati", name: "Householders", start: 51, end: 60 },
  { slug: "mn-vagga-07-bhikkhu", name: "Mendicants", start: 61, end: 70 },
  { slug: "mn-vagga-08-paribbajaka", name: "Wanderers", start: 71, end: 80 },
  { slug: "mn-vagga-09-raja", name: "Kings", start: 81, end: 90 },
  { slug: "mn-vagga-10-brahmana", name: "Brahmins", start: 91, end: 100 },
  { slug: "mn-vagga-11-devadaha", name: "Devadaha", start: 101, end: 110 },
  { slug: "mn-vagga-12-anupada", name: "One by One", start: 111, end: 120 },
  { slug: "mn-vagga-13-sunnata", name: "Emptiness", start: 121, end: 130 },
  { slug: "mn-vagga-14-vibhanga", name: "Analysis", start: 131, end: 142 },
  { slug: "mn-vagga-15-salayatana", name: "Six Sense Fields", start: 143, end: 152 },
];

export interface RawSutta {
  uid: string;
  title: string;
  pali_title: string;
  translation_text: string;
  root_text: string;
  vagga_slug: string;
}

async function fetchSutta(uid: string): Promise<{
  title: string;
  pali_title: string;
  translation_text: string;
  root_text: string;
} | null> {
  const url = `${BASE_URL}/bilarasuttas/${uid}/sujato`;

  try {
    const res = await fetch(url);
    if (!res.ok) {
      if (res.status === 404) return null;
      console.warn(`  ⚠ HTTP ${res.status} for ${uid}`);
      return null;
    }

    const data = await res.json() as Record<string, unknown>;
    const keysOrder: string[] = (data.keys_order as string[]) || [];
    const translationMap: Record<string, string> = (data.translation_text as Record<string, string>) || {};
    const rootMap: Record<string, string> = (data.root_text as Record<string, string>) || {};

    if (Object.keys(translationMap).length === 0) return null;

    const translationParts: string[] = [];
    const rootParts: string[] = [];
    let title = "";
    let paliTitle = "";

    for (const key of keysOrder) {
      if (key.endsWith(":0.3")) {
        title = (translationMap[key] || "").trim();
        paliTitle = (rootMap[key] || "").trim();
        continue;
      }
      if (key.includes(":0.")) continue;

      if (translationMap[key]) translationParts.push(translationMap[key].trim());
      if (rootMap[key]) rootParts.push(rootMap[key].trim());
    }

    const translationText = translationParts.join(" ");
    if (translationText.length < 20) return null;

    return {
      title,
      pali_title: paliTitle,
      translation_text: translationText,
      root_text: rootParts.join(" "),
    };
  } catch (error) {
    console.error(`  ✗ Failed to fetch ${uid}:`, error instanceof Error ? error.message : error);
    return null;
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function fetchMNVagga(
  vagga: (typeof VAGGAS_MN)[number],
  options: { skipExisting?: boolean } = {}
): Promise<RawSutta[]> {
  const outPath = join(DATA_DIR, `${vagga.slug}.json`);

  if (options.skipExisting && existsSync(outPath)) {
    console.log(`⏭ Skipping ${vagga.slug} (already exists)`);
    return JSON.parse(readFileSync(outPath, "utf-8")) as RawSutta[];
  }

  console.log(`\n📥 Fetching MN vagga: ${vagga.name} (MN ${vagga.start}–${vagga.end})`);
  const suttas: RawSutta[] = [];

  for (let i = vagga.start; i <= vagga.end; i++) {
    const uid = `mn${i}`;
    process.stdout.write(`  Fetching ${uid}... `);

    const result = await fetchSutta(uid);
    if (result) {
      suttas.push({
        uid,
        title: result.title,
        pali_title: result.pali_title,
        translation_text: result.translation_text,
        root_text: result.root_text,
        vagga_slug: vagga.slug,
      });
      console.log(`✓ (${result.translation_text.length} chars)`);
    } else {
      console.log("✗ (skipped)");
    }

    await delay(300);
  }

  mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(outPath, JSON.stringify(suttas, null, 2), "utf-8");
  console.log(`  💾 Saved ${suttas.length} suttas to ${vagga.slug}.json`);

  return suttas;
}

export async function fetchAllMN(
  options: { vaggaIndex?: number; skipExisting?: boolean } = {}
): Promise<RawSutta[]> {
  const targetVaggas =
    options.vaggaIndex !== undefined
      ? [VAGGAS_MN[options.vaggaIndex - 1]].filter(Boolean)
      : VAGGAS_MN;

  const allSuttas: RawSutta[] = [];
  for (const vagga of targetVaggas) {
    const suttas = await fetchMNVagga(vagga, { skipExisting: options.skipExisting });
    allSuttas.push(...suttas);
  }

  console.log(`\n✅ Fetched ${allSuttas.length} MN suttas total`);
  return allSuttas;
}
