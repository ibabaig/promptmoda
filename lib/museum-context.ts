// ---------------------------------------------------------------
// THE MUSEUM CONTEXT
// The values the museum (modagallery/lib/gemini.ts, baseVars) feeds into
// a chain's {{placeholders}}. Copied rather than shared because the two
// apps are separate repositories and separate deployments; if one
// changes, change the other. Keeping them identical is what makes a
// test run in this tool produce the same prompt the museum would send.
// ---------------------------------------------------------------

export type Wing = {
  id: number;
  slug: string;
  name: string;
  era_label: string;
  subject: string;
};

export type School = {
  slug: string;
  department: string;
  name: string;
  blurb: string;
};

export const AUDIENCE =
  "The audience is a university junior in New York City: chronically online, " +
  "originally from the Midwest, still fairly new to the city, living in a dorm, " +
  "exploring the city on weekends on very little money.";

export const HOUSE_RULES = [
  "Be specific. Name a real detail, not a category.",
  "Keep it good-natured. Punch at situations, never at groups of people.",
  "No markdown, headings, bullets, quotation marks or emoji.",
];

const INKS = {
  paper: "#F3F1EB",
  ink: "#121212",
  signal: "#E62B24",
  stone: "#D8DAD4",
  bone: "#E7E0D4",
} as const;

export const PALETTE_FOR_PROMPT = Object.entries(INKS)
  .map(([name, hex]) => `${name} ${hex}`)
  .join(", ");

// Prints hang portrait, Film is a widescreen frame. Text departments
// have no canvas; a square is used if a text chain is set to SVG.
export function canvasFor(department: string): { w: number; h: number } {
  if (department === "prints") return { w: 600, h: 800 };
  if (department === "film") return { w: 960, h: 540 };
  return { w: 800, h: 800 };
}

export function schoolDirection(slug: string): string {
  const d: Record<string, string> = {
    deadpan:
      "Flat affect. State the absurd thing as plain fact and stop. The humour is in what you refuse to acknowledge.",
    absurdist:
      "One surreal premise, total internal logic, escalate once, then stop at the funniest point.",
    observational:
      "One small specific true detail anyone who has been there recognises instantly. Precision, not exaggeration.",
    confessional:
      "Confess something faintly humiliating in the first person. No self-pity, no punchline signalling.",
    overshare:
      "Lowercase throughout, present tense, fragments allowed. Two or three beats, ending somewhere stranger than you started.",
    haiku:
      "Exactly three lines of 5, 7 and 5 syllables, separated by newlines. Count carefully. The turn lands on line three.",
    "free-verse": "No metre, no rhyme. Put the weight on where you break the line.",
    "prose-poem": "One dense paragraph. No line breaks. Prose rhythm, poem logic.",
    sonnet:
      "Fourteen lines, loose iambic pentameter, a turn around line nine. Rhyme only if it costs you nothing in sense.",
    concrete:
      "The arrangement on the page carries half the meaning. Use spacing and indentation as material.",
    elegy: "Grieve something small and unworthy of grief, with complete sincerity.",
    found:
      "Assemble the poem entirely from language that would really appear in this setting: signs, notices, announcements, overheard speech.",
  };
  return d[slug] ?? "";
}

export function museumVars(
  department: string,
  wing: Wing | null,
  school: School | null
): Record<string, string> {
  const canvas = canvasFor(department);
  const vars: Record<string, string> = {
    audience: AUDIENCE,
    house_rules: HOUSE_RULES.map((r) => `- ${r}`).join("\n"),
    palette: PALETTE_FOR_PROMPT,
    "canvas.w": String(canvas.w),
    "canvas.h": String(canvas.h),
  };
  if (wing) {
    vars["wing.name"] = wing.name;
    vars["wing.era_label"] = wing.era_label;
    vars["wing.subject"] = wing.subject;
  }
  if (school) {
    vars["school.name"] = school.name;
    vars["school.blurb"] = school.blurb;
    vars["school.direction"] = schoolDirection(school.slug);
  }
  return vars;
}

// The placeholders a curator can use, for the reference panel beside
// the step editor. Generated per run: {{input}}, {{previous}}, {{step_N}}.
export const PLACEHOLDERS: { name: string; when: string; what: string }[] = [
  { name: "input", when: "any chain", what: "The text typed into the Generate form." },
  { name: "previous", when: "sequential", what: "The output of the step before this one. On step 1 it equals {{input}}." },
  { name: "step_1, step_2, ...", when: "sequential", what: "The output of that earlier step." },
  { name: "audience", when: "any chain", what: "The museum audience description." },
  { name: "house_rules", when: "any chain", what: "The three house rules, as a bulleted list." },
  { name: "terms", when: "any chain", what: "Active vocabulary terms marked for injection." },
  { name: "examples", when: "any chain", what: "Active few-shot examples for this department (and school, if chosen)." },
  { name: "wing.name, wing.era_label, wing.subject", when: "a wing is chosen", what: "The gallery the work is made for." },
  { name: "school.name, school.blurb, school.direction", when: "a school is chosen", what: "The school the work is made in." },
  { name: "palette, canvas.w, canvas.h", when: "any chain", what: "The five house inks and the canvas size for SVG." },
];
