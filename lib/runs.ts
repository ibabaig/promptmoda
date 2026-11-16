import type { Db } from "@/lib/guard";

// ---------------------------------------------------------------
// WHAT A CHAIN HAS MADE
// Two sources, both keyed on generation_requests.chain_id:
//   - tool runs (origin tool): output_text holds the final output;
//     llm_responses holds every step.
//   - museum works (origin house or member): the request points at a
//     works row, which holds the hung artwork.
// ---------------------------------------------------------------

export type Run = {
  id: number;
  origin: "house" | "member" | "tool";
  status: "pending" | "succeeded" | "failed";
  failure_reason: string | null;
  department: string;
  school: string | null;
  input_text: string | null;
  input_image_path: string | null;
  output_text: string | null;
  prompt_text: string | null;
  duration_ms: number | null;
  created_at: string;
  work_id: number | null;
  chain_id: number | null;
};

export type Work = {
  id: number;
  title: string | null;
  body: string | null;
  svg_source: string | null;
  caption: string | null;
  department: string;
  hung_on: string | null;
  accessioned_at: string | null;
  score: number;
};

export type StepResponse = {
  id: number;
  step_id: number | null;
  step_order: number | null;
  prompt_text: string | null;
  raw_text: string | null;
  finish_reason: string | null;
  prompt_tokens: number | null;
  thought_tokens: number | null;
  output_tokens: number | null;
  duration_ms: number | null;
  sanitiser_ok: boolean | null;
  sanitiser_reason: string | null;
};

const RUN_COLS =
  "id, origin, status, failure_reason, department, school, input_text, input_image_path, output_text, prompt_text, duration_ms, created_at, work_id, chain_id";

export async function listRuns(
  db: Db,
  chainId: number,
  limit = 60
): Promise<{ runs: Run[]; works: Map<number, Work> }> {
  const { data, error } = await db
    .from("generation_requests")
    .select(RUN_COLS)
    .eq("chain_id", chainId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`Could not load runs: ${error.message}`);

  const runs = (data ?? []) as unknown as Run[];
  const workIds = runs.map((r) => r.work_id).filter((x): x is number => x !== null);
  const works = new Map<number, Work>();

  if (workIds.length > 0) {
    const { data: w } = await db
      .from("works")
      .select("id, title, body, svg_source, caption, department, hung_on, accessioned_at, score")
      .in("id", workIds);
    for (const row of (w ?? []) as unknown as Work[]) works.set(row.id, row);
  }

  return { runs, works };
}

export async function getRun(
  db: Db,
  id: number
): Promise<{ run: Run; responses: StepResponse[]; work: Work | null } | null> {
  const { data, error } = await db.from("generation_requests").select(RUN_COLS).eq("id", id).maybeSingle();
  if (error) throw new Error(`Could not load run: ${error.message}`);
  if (!data) return null;
  const run = data as unknown as Run;

  const [resp, work] = await Promise.all([
    db
      .from("llm_responses")
      .select(
        "id, step_id, step_order, prompt_text, raw_text, finish_reason, prompt_tokens, thought_tokens, output_tokens, duration_ms, sanitiser_ok, sanitiser_reason"
      )
      .eq("request_id", id)
      .order("created_at"),
    run.work_id
      ? db
          .from("works")
          .select("id, title, body, svg_source, caption, department, hung_on, accessioned_at, score")
          .eq("id", run.work_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  return {
    run,
    responses: (resp.data ?? []) as unknown as StepResponse[],
    work: (work.data as unknown as Work | null) ?? null,
  };
}

export const INPUT_BUCKET = "museum-images";

export function publicImageUrl(db: Db, path: string): string {
  return db.storage.from(INPUT_BUCKET).getPublicUrl(path).data.publicUrl;
}
