import { GoogleGenAI } from "@google/genai";
import type { Db } from "@/lib/guard";
import { getChain, type Chain, type Step } from "@/lib/chains";
import { canvasFor, museumVars, type School, type Wing } from "@/lib/museum-context";
import { sanitiseSvg } from "@/lib/svg-sanitize";

// ---------------------------------------------------------------
// THE RUN ENGINE
//
// Two ways to execute a chain, chosen by prompt_chains.execution:
//
//   assembled  -- every active step is a section. Substitute, join with
//                 blank lines, send ONE call. Exactly what the museum
//                 does, so a test run here sends the prompt the museum
//                 would send.
//   sequential -- every active step is its own call. Step N is sent
//                 with {{previous}} = output of step N-1 and
//                 {{step_k}} = output of step k. If the chain takes an
//                 image, it is attached to step 1 only; later steps work
//                 from what step 1 said about it.
//
// Unlike the museum, telemetry here is NOT best-effort. The museum logs
// as a side effect of making a work, so a logging failure must not stop
// the work. In this tool the logged run IS the output -- it is what the
// media view shows -- so a failure to record it is a failure, full stop.
// ---------------------------------------------------------------

export type RunInput = {
  text: string | null;
  image: { data: Buffer; mimeType: string; path: string } | null;
  wing: Wing | null;
  school: School | null;
};

export type RunResult = { requestId: number; ok: boolean };

type ModelChoice = {
  id: number | null;
  slug: string;
  temperature: number;
  maxOutputTokens: number;
};

function client(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "GEMINI_API_KEY is not set. Add it to .env.local and to the Vercel project. " +
        "It must NOT have a NEXT_PUBLIC_ prefix."
    );
  }
  return new GoogleGenAI({ apiKey });
}

// Unknown placeholders are left in place, not blanked: a typo then shows
// up in the recorded prompt where it is obvious, instead of silently
// deleting an instruction. Same rule as the museum.
export function substitute(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{([a-z0-9_.]+)\}\}/gi, (whole, key: string) =>
    key in vars ? vars[key] : whole
  );
}

async function chooseModel(db: Db, chain: Chain): Promise<ModelChoice> {
  type ModelRow = { slug: string; max_output_tokens: number; default_temperature: number };
  let model: ModelRow | null = null;
  if (chain.model_id) {
    const { data } = await db
      .from("llm_models")
      .select("slug, max_output_tokens, default_temperature")
      .eq("id", chain.model_id)
      .maybeSingle();
    model = (data as unknown as ModelRow | null) ?? null;
  }
  return {
    id: chain.model_id,
    slug: model?.slug ?? process.env.GEMINI_MODEL ?? "gemini-flash-latest",
    temperature: Number(chain.temperature ?? model?.default_temperature ?? 1),
    // maxOutputTokens caps thinking AND output together, as one hard
    // cutoff. Too low and the model spends it all reasoning and returns
    // an empty string -- the museum lost a week of poems to this at 400.
    maxOutputTokens: chain.max_output_tokens ?? model?.max_output_tokens ?? (chain.media === "svg" ? 9000 : 2400),
  };
}

async function termsBlock(db: Db): Promise<string> {
  const { data } = await db
    .from("terms")
    .select("term, definition, usage_note")
    .eq("is_active", true)
    .eq("inject_into_prompts", true)
    .order("term");
  const rows = (data ?? []) as unknown as { term: string; definition: string; usage_note: string | null }[];
  if (rows.length === 0) return "";
  return [
    "HOUSE VOCABULARY — use these words for these things:",
    ...rows.map((r) => `- ${r.term}: ${r.definition}${r.usage_note ? ` ${r.usage_note}` : ""}`),
  ].join("\n");
}

async function examplesBlock(db: Db, chain: Chain, school: string | null): Promise<string> {
  const { data } = await db
    .from("ai_generation_examples")
    .select("school, chain_id, label, example_output, polarity")
    .eq("department", chain.department)
    .eq("is_active", true)
    .order("sort_order");
  type Row = { school: string | null; chain_id: number | null; label: string; example_output: string; polarity: string };
  const rows = ((data ?? []) as unknown as Row[]).filter(
    (r) => (r.school === null || r.school === school) && (r.chain_id === null || r.chain_id === chain.id)
  );
  if (rows.length === 0) return "";
  const side = (p: string) => (p === "negative" ? "NOT LIKE THIS" : "LIKE THIS");
  return ["EXAMPLES", ...rows.map((r) => `--- ${side(r.polarity)} (${r.label}) ---\n${r.example_output}`)].join("\n");
}

type CallResult = {
  text: string;
  finishReason: string | null;
  usage: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    thoughtsTokenCount?: number;
    totalTokenCount?: number;
  } | undefined;
  durationMs: number;
};

async function call(model: ModelChoice, prompt: string, image: RunInput["image"]): Promise<CallResult> {
  const parts: ({ text: string } | { inlineData: { mimeType: string; data: string } })[] = [];
  // Image before text: Gemini attends to the image better when the
  // instruction about it comes after it.
  if (image) parts.push({ inlineData: { mimeType: image.mimeType, data: image.data.toString("base64") } });
  parts.push({ text: prompt });

  const started = Date.now();
  const response = await client().models.generateContent({
    model: model.slug,
    contents: [{ role: "user", parts }],
    config: { temperature: model.temperature, maxOutputTokens: model.maxOutputTokens },
  });

  return {
    text: response.text?.trim() ?? "",
    finishReason: response.candidates?.[0]?.finishReason ?? null,
    usage: response.usageMetadata,
    durationMs: Date.now() - started,
  };
}

function silentReason(finishReason: string | null): string {
  if (finishReason === "MAX_TOKENS") {
    return "The model ran out of room before it wrote anything: thinking and output share max_output_tokens. Raise it on the chain.";
  }
  if (finishReason === "SAFETY" || finishReason === "PROHIBITED_CONTENT") {
    return `The model declined to answer (finish reason ${finishReason}).`;
  }
  return `The model returned no text (finish reason ${finishReason ?? "unknown"}).`;
}

async function logResponse(
  db: Db,
  requestId: number,
  modelId: number | null,
  step: Step | null,
  prompt: string,
  result: CallResult,
  svg?: { ok: boolean; reason: string | null }
): Promise<void> {
  const { error } = await db.from("llm_responses").insert({
    request_id: requestId,
    model_id: modelId,
    step_id: step?.id ?? null,
    step_order: step?.step_order ?? null,
    prompt_text: prompt.slice(0, 20000),
    raw_text: result.text ? result.text.slice(0, 20000) : null,
    finish_reason: result.finishReason,
    prompt_tokens: result.usage?.promptTokenCount ?? null,
    thought_tokens: result.usage?.thoughtsTokenCount ?? null,
    output_tokens: result.usage?.candidatesTokenCount ?? null,
    total_tokens: result.usage?.totalTokenCount ?? null,
    duration_ms: result.durationMs,
    was_sanitised: Boolean(svg),
    sanitiser_ok: svg ? svg.ok : null,
    sanitiser_reason: svg?.reason ?? null,
  });
  if (error) throw new Error(`Could not record the response: ${error.message}`);
}

async function finish(
  db: Db,
  requestId: number,
  started: number,
  outcome: { ok: true; output: string } | { ok: false; reason: string; output?: string | null }
): Promise<RunResult> {
  const { error } = await db
    .from("generation_requests")
    .update({
      status: outcome.ok ? "succeeded" : "failed",
      failure_reason: outcome.ok ? null : outcome.reason,
      output_text: outcome.ok ? outcome.output : outcome.output ?? null,
      duration_ms: Date.now() - started,
      completed_at: new Date().toISOString(),
    })
    .eq("id", requestId);
  if (error) throw new Error(`Could not close the run: ${error.message}`);
  return { requestId, ok: outcome.ok };
}

export async function runChain(
  db: Db,
  userId: string,
  chainId: number,
  input: RunInput
): Promise<RunResult> {
  const found = await getChain(db, chainId);
  if (!found) throw new Error("That chain no longer exists.");
  const { chain } = found;
  const steps = found.steps.filter((s) => s.is_active);
  if (steps.length === 0) throw new Error("This chain has no active steps, so there is nothing to run.");
  if (chain.input_kind === "image" && !input.image) throw new Error("This chain starts from an image. Choose one to upload.");

  const model = await chooseModel(db, chain);
  const [terms, examples] = await Promise.all([termsBlock(db), examplesBlock(db, chain, input.school?.slug ?? null)]);

  const vars: Record<string, string> = {
    ...museumVars(chain.department, input.wing, input.school),
    terms,
    examples,
    input: input.text ?? "",
  };

  const assembledPrompt =
    chain.execution === "assembled"
      ? steps.map((s) => substitute(s.template, vars).trim()).filter(Boolean).join("\n\n")
      : null;

  const { data: opened, error: openErr } = await db
    .from("generation_requests")
    .insert({
      requester_id: userId,
      origin: "tool",
      department: chain.department,
      school: input.school?.slug ?? null,
      wing_id: input.wing?.id ?? null,
      chain_id: chain.id,
      model_id: model.id,
      status: "pending",
      prompt_text: assembledPrompt,
      input_text: input.text,
      input_image_path: input.image?.path ?? null,
    })
    .select("id")
    .single();
  if (openErr) throw new Error(`Could not start the run: ${openErr.message}`);
  const requestId = (opened as { id: number }).id;
  const started = Date.now();

  try {
    let output = "";

    if (assembledPrompt !== null) {
      const result = await call(model, assembledPrompt, input.image);
      const svg = chain.media === "svg" ? sanitiseSvg(result.text, canvasFor(chain.department)) : null;
      await logResponse(db, requestId, model.id, null, assembledPrompt, result,
        svg ? { ok: svg.ok, reason: svg.ok ? null : svg.reason } : undefined);
      if (!result.text) return finish(db, requestId, started, { ok: false, reason: silentReason(result.finishReason) });
      if (svg && !svg.ok) return finish(db, requestId, started, { ok: false, reason: `SVG rejected: ${svg.reason}` });
      output = svg && svg.ok ? svg.svg : result.text;
    } else {
      let previous = input.text ?? "";
      for (let i = 0; i < steps.length; i++) {
        const step = steps[i];
        const isLast = i === steps.length - 1;
        const prompt = substitute(step.template, { ...vars, previous }).trim();
        const result = await call(model, prompt, i === 0 ? input.image : null);

        // Only the final step is the artwork, so only it is sanitised.
        const svg = isLast && chain.media === "svg" ? sanitiseSvg(result.text, canvasFor(chain.department)) : null;
        await logResponse(db, requestId, model.id, step, prompt, result,
          svg ? { ok: svg.ok, reason: svg.ok ? null : svg.reason } : undefined);

        if (!result.text) {
          return finish(db, requestId, started, {
            ok: false,
            reason: `Step ${i + 1} (${step.label}): ${silentReason(result.finishReason)}`,
            output: previous || null,
          });
        }
        if (svg && !svg.ok) {
          return finish(db, requestId, started, { ok: false, reason: `SVG rejected: ${svg.reason}` });
        }

        previous = svg && svg.ok ? svg.svg : result.text;
        vars[`step_${i + 1}`] = result.text;
      }
      output = previous;
    }

    return finish(db, requestId, started, { ok: true, output });
  } catch (e) {
    const reason = e instanceof Error ? e.message : String(e);
    return finish(db, requestId, started, { ok: false, reason });
  }
}
