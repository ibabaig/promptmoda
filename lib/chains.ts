import type { Db } from "@/lib/guard";

// ---------------------------------------------------------------
// THE CHAIN REPOSITORY
// The only file that knows the column names of prompt_chains and
// prompt_chain_steps. Pages and actions talk to these functions.
// ---------------------------------------------------------------

export const DEPARTMENTS = ["humour", "poetry", "prints", "film"] as const;
export const MEDIA = ["text", "svg"] as const;
export const EXECUTIONS = ["sequential", "assembled"] as const;
export const INPUT_KINDS = ["none", "text", "image"] as const;

// The seven section roles 010 defined for assembled chains, plus the
// one 011 added for a sequential step (a whole model call).
export const SECTION_ROLES = [
  "role", "context", "audience", "school", "rules", "examples", "format",
] as const;

export type Department = (typeof DEPARTMENTS)[number];
export type Media = (typeof MEDIA)[number];
export type Execution = (typeof EXECUTIONS)[number];
export type InputKind = (typeof INPUT_KINDS)[number];

export type Chain = {
  id: number;
  slug: string;
  name: string;
  department: Department;
  media: Media;
  model_id: number | null;
  temperature: number | null;
  max_output_tokens: number | null;
  is_active: boolean;
  notes: string | null;
  execution: Execution;
  input_kind: InputKind;
  created_at: string;
  updated_at: string;
};

export type Step = {
  id: number;
  chain_id: number;
  step_order: number;
  role: string;
  label: string;
  template: string;
  is_active: boolean;
};

export type Model = {
  id: number;
  slug: string;
  display_name: string;
  max_output_tokens: number;
  default_temperature: number;
  is_active: boolean;
};

export type ChainSummary = Chain & {
  step_count: number;
  run_count: number;
  weight: number | null;
};

const CHAIN_COLS =
  "id, slug, name, department, media, model_id, temperature, max_output_tokens, is_active, notes, execution, input_kind, created_at, updated_at";

const STEP_COLS = "id, chain_id, step_order, role, label, template, is_active";

export async function listChains(db: Db): Promise<ChainSummary[]> {
  const [chains, steps, runs, mix] = await Promise.all([
    db.from("prompt_chains").select(CHAIN_COLS).order("department").order("slug"),
    db.from("prompt_chain_steps").select("chain_id"),
    db.from("generation_requests").select("chain_id").not("chain_id", "is", null),
    db.from("prompt_chain_mix").select("chain_id, weight"),
  ]);

  if (chains.error) throw new Error(`Could not load chains: ${chains.error.message}`);

  const count = (rows: { chain_id: number | null }[] | null) => {
    const m = new Map<number, number>();
    for (const r of rows ?? []) if (r.chain_id !== null) m.set(r.chain_id, (m.get(r.chain_id) ?? 0) + 1);
    return m;
  };

  const stepCounts = count(steps.data as unknown as { chain_id: number }[]);
  const runCounts = count(runs.data as unknown as { chain_id: number | null }[]);
  const weights = new Map(
    ((mix.data ?? []) as unknown as { chain_id: number; weight: number }[]).map((m) => [m.chain_id, m.weight])
  );

  return (chains.data as unknown as Chain[]).map((c) => ({
    ...c,
    step_count: stepCounts.get(c.id) ?? 0,
    run_count: runCounts.get(c.id) ?? 0,
    weight: weights.get(c.id) ?? null,
  }));
}

export async function getChain(
  db: Db,
  id: number
): Promise<{ chain: Chain; steps: Step[]; weight: number | null } | null> {
  const [chainRes, stepsRes, mixRes] = await Promise.all([
    db.from("prompt_chains").select(CHAIN_COLS).eq("id", id).maybeSingle(),
    db.from("prompt_chain_steps").select(STEP_COLS).eq("chain_id", id).order("step_order"),
    db.from("prompt_chain_mix").select("weight").eq("chain_id", id).maybeSingle(),
  ]);

  if (chainRes.error) throw new Error(`Could not load chain: ${chainRes.error.message}`);
  if (!chainRes.data) return null;
  if (stepsRes.error) throw new Error(`Could not load steps: ${stepsRes.error.message}`);

  return {
    chain: chainRes.data as unknown as Chain,
    steps: (stepsRes.data ?? []) as unknown as Step[],
    weight: (mixRes.data as { weight: number } | null)?.weight ?? null,
  };
}

export async function listModels(db: Db): Promise<Model[]> {
  const { data, error } = await db
    .from("llm_models")
    .select("id, slug, display_name, max_output_tokens, default_temperature, is_active")
    .eq("kind", "text")
    .order("slug");
  if (error) throw new Error(`Could not load models: ${error.message}`);
  return (data ?? []) as unknown as Model[];
}

// ---- writes -------------------------------------------------------

export type ChainInput = {
  slug: string;
  name: string;
  department: Department;
  media: Media;
  execution: Execution;
  input_kind: InputKind;
  model_id: number | null;
  temperature: number | null;
  max_output_tokens: number | null;
  is_active: boolean;
  notes: string | null;
};

export async function createChain(db: Db, input: ChainInput): Promise<number> {
  const { data, error } = await db.from("prompt_chains").insert(input).select("id").single();
  if (error) throw new Error(friendly(error.message));
  return (data as { id: number }).id;
}

export async function updateChain(db: Db, id: number, input: ChainInput): Promise<void> {
  const { error } = await db
    .from("prompt_chains")
    .update({ ...input, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(friendly(error.message));
}

export async function deleteChain(db: Db, id: number): Promise<void> {
  // Steps, the mix row and chain-specific examples cascade. Past runs
  // keep their outputs; their chain_id becomes null (010 FK).
  const { error } = await db.from("prompt_chains").delete().eq("id", id);
  if (error) throw new Error(friendly(error.message));
}

export type StepInput = {
  role: string;
  label: string;
  template: string;
  is_active: boolean;
};

export async function createStep(db: Db, chainId: number, input: StepInput): Promise<void> {
  // Appended at the end. Moving it is what the reorder controls are for.
  const { data: last } = await db
    .from("prompt_chain_steps")
    .select("step_order")
    .eq("chain_id", chainId)
    .order("step_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  const next = ((last as { step_order: number } | null)?.step_order ?? 0) + 1;

  const { error } = await db
    .from("prompt_chain_steps")
    .insert({ ...input, chain_id: chainId, step_order: next });
  if (error) throw new Error(friendly(error.message));
}

export async function updateStep(db: Db, stepId: number, input: StepInput): Promise<void> {
  const { error } = await db
    .from("prompt_chain_steps")
    .update({ ...input, updated_at: new Date().toISOString() })
    .eq("id", stepId);
  if (error) throw new Error(friendly(error.message));
}

export async function deleteStep(db: Db, chainId: number, stepId: number): Promise<void> {
  const { error } = await db.from("prompt_chain_steps").delete().eq("id", stepId).eq("chain_id", chainId);
  if (error) throw new Error(friendly(error.message));

  // Close the gap so the numbering a curator sees stays 1..n.
  const { data } = await db
    .from("prompt_chain_steps")
    .select("id")
    .eq("chain_id", chainId)
    .order("step_order");
  const ids = ((data ?? []) as { id: number }[]).map((r) => r.id);
  if (ids.length > 0) await reorderSteps(db, chainId, ids);
}

// Hands the database the complete new order. The function renumbers
// every step in one statement under a deferred unique constraint, so
// swapping 1 and 2 never trips over two rows briefly sharing a number.
export async function reorderSteps(db: Db, chainId: number, stepIds: number[]): Promise<void> {
  const { error } = await db.rpc("reorder_prompt_chain_steps", {
    p_chain_id: chainId,
    p_step_ids: stepIds,
  });
  if (error) throw new Error(friendly(error.message));
}

// Postgres error text is accurate but not always readable. Translate the
// ones a curator is likely to hit; pass anything else through.
function friendly(message: string): string {
  if (/prompt_chains_slug_key/.test(message)) return "That slug is already taken by another chain.";
  if (/row-level security/i.test(message)) return "The database refused this change: your account is not a curator.";
  if (/sequential chain cannot take a share/.test(message)) return message;
  if (/_check/.test(message)) return `A value is outside what the database allows (${message}).`;
  return message;
}
