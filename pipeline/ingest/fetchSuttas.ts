import { mkdirSync, writeFileSync, existsSync, readFileSync } from "fs";
import { join } from "path";

const BASE_URL = "https://suttacentral.net/api";
const DATA_DIR = join(__dirname, "../../data/sources/an5");

/**
 * Vagga definitions for AN Book of Fives.
 * Each vagga has a slug, a name, and the sutta UID range it covers.
 */
export const VAGGAS = [
  { slug: "vagga-01-sekhabala", name: "Powers of a Trainee", start: 1, end: 10 },
  { slug: "vagga-02-bala", name: "Powers", start: 11, end: 20 },
  { slug: "vagga-03-pancangika", name: "Five Factors", start: 21, end: 30 },
  { slug: "vagga-04-sumana", name: "Sumanā", start: 31, end: 40 },
  { slug: "vagga-05-mundaraja", name: "King Muṇḍa", start: 41, end: 50 },
  { slug: "vagga-06-nivarana", name: "Hindrances", start: 51, end: 60 },
  { slug: "vagga-07-sanna", name: "Perceptions", start: 61, end: 70 },
  { slug: "vagga-08-yodhajiva", name: "Warrior", start: 71, end: 80 },
  { slug: "vagga-09-thera", name: "Senior Mendicants", start: 81, end: 90 },
  { slug: "vagga-10-kakudha", name: "Kakudha", start: 91, end: 100 },
  { slug: "vagga-11-phasuvihara", name: "Living Comfortably", start: 101, end: 110 },
  { slug: "vagga-12-andhakavinda", name: "Andhakavinda", start: 111, end: 120 },
  { slug: "vagga-13-gilana", name: "Sick", start: 121, end: 130 },
  { slug: "vagga-14-raja", name: "Kings", start: 131, end: 140 },
  { slug: "vagga-15-tikandaki", name: "Tikaṇḍakī", start: 141, end: 150 },
  { slug: "vagga-16-saddhamma", name: "True Teaching", start: 151, end: 160 },
  { slug: "vagga-17-aghata", name: "Resentment", start: 161, end: 170 },
  { slug: "vagga-18-upasaka", name: "Lay Follower", start: 171, end: 180 },
  { slug: "vagga-19-aranna", name: "Wilderness Dwellers", start: 181, end: 190 },
  { slug: "vagga-20-brahmana", name: "Brahmins", start: 191, end: 200 },
  { slug: "vagga-21-kimila", name: "Kimbila", start: 201, end: 210 },
  { slug: "vagga-22-akkosaka", name: "Abuse", start: 211, end: 220 },
  { slug: "vagga-23-dighacarika", name: "Long Wandering", start: 221, end: 230 },
  { slug: "vagga-24-avasika", name: "Resident Mendicant", start: 231, end: 240 },
  { slug: "vagga-25-duccarita", name: "Bad Conduct", start: 241, end: 250 },
  { slug: "vagga-26-upasampadā", name: "Ordination", start: 251, end: 260 },
];

export interface RawSutta {
  uid: string;
  title: string;
  pali_title: string;
  translation_text: string;
  root_text: string;
  vagga_slug: string;
}

/**
 * Fetch a single sutta from SuttaCentral API.
 * Returns null if the sutta doesn't exist or has no Sujato translation.
 */
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

    // Skip if no translation available
    if (Object.keys(translationMap).length === 0) return null;

    // Reassemble full text from segments
    const translationParts: string[] = [];
    const rootParts: string[] = [];
    let title = "";
    let paliTitle = "";

    for (const key of keysOrder) {
      // Extract title from the :0.3 segment (sutta title)
      if (key.endsWith(":0.3")) {
        title = (translationMap[key] || "").trim();
        paliTitle = (rootMap[key] || "").trim();
        continue;
      }
      // Skip header segments (:0.x)
      if (key.includes(":0.")) continue;

      if (translationMap[key]) {
        translationParts.push(translationMap[key].trim());
      }
      if (rootMap[key]) {
        rootParts.push(rootMap[key].trim());
      }
    }

    const translationText = translationParts.join(" ");
    const rootText = rootParts.join(" ");

    if (translationText.length < 20) return null;

    return { title, pali_title: paliTitle, translation_text: translationText, root_text: rootText };
  } catch (error) {
    console.error(`  ✗ Failed to fetch ${uid}:`, error instanceof Error ? error.message : error);
    return null;
  }
}

/**
 * Add a delay between API requests to be respectful to SuttaCentral.
 */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Fetch all suttas for a given vagga and save to disk.
 */
export async function fetchVagga(
  vagga: (typeof VAGGAS)[number],
  options: { skipExisting?: boolean } = {}
): Promise<RawSutta[]> {
  const outPath = join(DATA_DIR, `${vagga.slug}.json`);

  if (options.skipExisting && existsSync(outPath)) {
    console.log(`⏭ Skipping ${vagga.slug} (already exists)`);
    const existing = JSON.parse(readFileSync(outPath, "utf-8")) as RawSutta[];
    return existing;
  }

  console.log(`\n📥 Fetching vagga: ${vagga.name} (AN 5.${vagga.start}–5.${vagga.end})`);
  const suttas: RawSutta[] = [];

  for (let i = vagga.start; i <= vagga.end; i++) {
    const uid = `an5.${i}`;
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

    // Be polite to the API
    await delay(300);
  }

  // Save to disk
  mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(outPath, JSON.stringify(suttas, null, 2), "utf-8");
  console.log(`  💾 Saved ${suttas.length} suttas to ${vagga.slug}.json`);

  return suttas;
}

/**
 * Fetch all vaggas (or a specific one by index).
 */
export async function fetchAllSuttas(
  options: { vaggaIndex?: number; skipExisting?: boolean } = {}
): Promise<RawSutta[]> {
  const targetVaggas =
    options.vaggaIndex !== undefined
      ? [VAGGAS[options.vaggaIndex - 1]].filter(Boolean)
      : VAGGAS;

  if (targetVaggas.length === 0) {
    console.error("Invalid vagga index");
    return [];
  }

  const allSuttas: RawSutta[] = [];

  for (const vagga of targetVaggas) {
    const suttas = await fetchVagga(vagga, { skipExisting: options.skipExisting });
    allSuttas.push(...suttas);
  }

  console.log(`\n✅ Fetched ${allSuttas.length} suttas total`);
  return allSuttas;
}
