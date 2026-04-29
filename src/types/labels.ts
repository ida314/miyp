/**
 * Buddhist diagnostic label ontology for MVP.
 * Deliberately small for consistency and evaluability.
 */

export const BUDDHIST_LABELS = [
  "craving_attachment",
  "aversion_anger",
  "delusion_confusion",
  "grief_loss",
  "fear_anxiety",
  "restlessness_distraction",
  "doubt_indecision",
  "ethical_conflict",
  "speech_relationships",
  "discipline_habit_formation",
] as const;

export type BuddhistLabel = (typeof BUDDHIST_LABELS)[number];

/**
 * Second-layer canonical structure mappings.
 */
export const CANONICAL_MAPPINGS: Record<string, string[]> = {
  three_poisons: ["craving_attachment", "aversion_anger", "delusion_confusion"],
  five_hindrances: [
    "craving_attachment",
    "aversion_anger",
    "restlessness_distraction",
    "doubt_indecision",
    "delusion_confusion",
  ],
  right_speech: ["speech_relationships"],
  generosity: ["craving_attachment"],
  sense_restraint: ["craving_attachment", "restlessness_distraction"],
  impermanence: [
    "craving_attachment",
    "grief_loss",
    "fear_anxiety",
  ],
  non_self: ["craving_attachment", "delusion_confusion"],
  gradual_training: ["discipline_habit_formation"],
};

/**
 * Common emotion labels that map to user language.
 */
export const EMOTION_LABELS = [
  "anger",
  "resentment",
  "jealousy",
  "envy",
  "anxiety",
  "worry",
  "fear",
  "grief",
  "sadness",
  "loneliness",
  "guilt",
  "shame",
  "frustration",
  "restlessness",
  "boredom",
  "confusion",
  "indecision",
  "craving",
  "longing",
  "regret",
] as const;

export type EmotionLabel = (typeof EMOTION_LABELS)[number];

/**
 * Crisis keywords that should trigger safety redirection.
 */
export const CRISIS_KEYWORDS = [
  "suicide",
  "kill myself",
  "end my life",
  "want to die",
  "self-harm",
  "hurt myself",
  "cutting myself",
  "no reason to live",
  "better off dead",
  "can't go on",
];
