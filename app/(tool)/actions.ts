"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireSuperadmin } from "@/lib/guard";
import {
  DEPARTMENTS,
  EXECUTIONS,
  INPUT_KINDS,
  MEDIA,
  SECTION_ROLES,
  createChain,
  createStep,
  deleteChain,
  deleteStep,
  getChain,
  reorderSteps,
  updateChain,
  updateStep,
  type ChainInput,
  type Execution,
  type StepInput,
} from "@/lib/chains";
import { bool, int, oneOf, optInt, optNum, optStr, rawText, str } from "@/lib/form";
import { runChain } from "@/lib/run";
import { INPUT_BUCKET } from "@/lib/runs";
import type { School, Wing } from "@/lib/museum-context";

// Every action below starts with requireSuperadmin(). A server action is
// its own POST endpoint: it can be called without ever loading the page
// that renders its form, so it cannot rely on that page having checked.
//
// Errors come back to the page as ?error=..., not as a thrown exception,
// so a curator sees what went wrong next to the form they were using.
// redirect() works by throwing, so it is always called OUTSIDE the try.

function message(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

function back(path: string, params: Record<string, string>): never {
  const q = new URLSearchParams(params).toString();
  redirect(q ? `${path}?${q}` : path);
}

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function readChain(fd: FormData): ChainInput {
  const slug = str(fd, "slug").toLowerCase();
  if (!SLUG.test(slug)) throw new Error("Slug: lowercase letters, digits and single hyphens only, e.g. image-captions-v2.");
  const name = str(fd, "name");
  if (!name) throw new Error("Give the chain a name.");

  const temperature = optNum(fd, "temperature");
  if (temperature !== null && (temperature < 0 || temperature > 2)) throw new Error("Temperature must be between 0 and 2.");
  const maxTokens = optInt(fd, "max_output_tokens");
  if (maxTokens !== null && (maxTokens < 256 || maxTokens > 65536)) {
    throw new Error("Max output tokens must be between 256 and 65536. Thinking spends from the same budget, so keep it generous.");
  }

  return {
    slug,
    name,
    department: oneOf(fd, "department", DEPARTMENTS),
    media: oneOf(fd, "media", MEDIA),
    execution: oneOf(fd, "execution", EXECUTIONS),
    input_kind: oneOf(fd, "input_kind", INPUT_KINDS),
    model_id: optInt(fd, "model_id"),
    temperature,
    max_output_tokens: maxTokens,
    is_active: bool(fd, "is_active"),
    notes: optStr(fd, "notes"),
  };
}

function readStep(fd: FormData, execution: Execution): StepInput {
  const label = str(fd, "label");
  if (!label) throw new Error("Give the step a label.");
  const template = rawText(fd, "template");
  if (!template.trim()) throw new Error("A step needs a prompt template.");
  if (template.length > 20000) throw new Error("That template is over 20,000 characters.");

  // A sequential step is a whole call; an assembled step is a section
  // and keeps one of the seven section roles 010 defined.
  const role = execution === "sequential" ? "call" : oneOf(fd, "role", SECTION_ROLES);
  return { role, label, template, is_active: bool(fd, "is_active") };
}

// ---- chains --------------------------------------------------------

export async function createChainAction(fd: FormData) {
  const { supabase } = await requireSuperadmin();
  let id: number;
  try {
    id = await createChain(supabase, readChain(fd));
  } catch (e) {
    back("/chains/new", { error: message(e) });
  }
  revalidatePath("/");
  redirect(`/chains/${id}?saved=created`);
}

export async function updateChainAction(fd: FormData) {
  const { supabase } = await requireSuperadmin();
  const id = int(fd, "chain_id");
  try {
    await updateChain(supabase, id, readChain(fd));
  } catch (e) {
    back(`/chains/${id}`, { error: message(e) });
  }
  revalidatePath("/");
  revalidatePath(`/chains/${id}`);
  back(`/chains/${id}`, { saved: "chain" });
}

export async function deleteChainAction(fd: FormData) {
  const { supabase } = await requireSuperadmin();
  const id = int(fd, "chain_id");
  // The confirm field stops a stray click. It must match the slug.
  const found = await getChain(supabase, id);
  if (!found) back("/", { error: "That chain no longer exists." });
  if (str(fd, "confirm") !== found.chain.slug) {
    back(`/chains/${id}`, { error: `To delete, type the slug ${found.chain.slug} exactly.` });
  }
  try {
    await deleteChain(supabase, id);
  } catch (e) {
    back(`/chains/${id}`, { error: message(e) });
  }
  revalidatePath("/");
  back("/", { deleted: found.chain.slug });
}

// ---- steps ---------------------------------------------------------

async function chainOf(fd: FormData) {
  const { supabase } = await requireSuperadmin();
  const chainId = int(fd, "chain_id");
  const found = await getChain(supabase, chainId);
  if (!found) back("/", { error: "That chain no longer exists." });
  return { supabase, chainId, found };
}

export async function createStepAction(fd: FormData) {
  const { supabase, chainId, found } = await chainOf(fd);
  try {
    await createStep(supabase, chainId, readStep(fd, found.chain.execution));
  } catch (e) {
    back(`/chains/${chainId}`, { error: message(e) });
  }
  revalidatePath(`/chains/${chainId}`);
  redirect(`/chains/${chainId}?saved=step-added#steps`);
}

export async function updateStepAction(fd: FormData) {
  const { supabase, chainId, found } = await chainOf(fd);
  const stepId = int(fd, "step_id");
  if (!found.steps.some((s) => s.id === stepId)) back(`/chains/${chainId}`, { error: "That step is not in this chain." });
  try {
    await updateStep(supabase, stepId, readStep(fd, found.chain.execution));
  } catch (e) {
    back(`/chains/${chainId}`, { error: message(e) });
  }
  revalidatePath(`/chains/${chainId}`);
  redirect(`/chains/${chainId}?saved=step#step-${stepId}`);
}

export async function deleteStepAction(fd: FormData) {
  const { supabase, chainId } = await chainOf(fd);
  const stepId = int(fd, "step_id");
  try {
    await deleteStep(supabase, chainId, stepId);
  } catch (e) {
    back(`/chains/${chainId}`, { error: message(e) });
  }
  revalidatePath(`/chains/${chainId}`);
  redirect(`/chains/${chainId}?saved=step-deleted#steps`);
}

// Move a step to a new position. Works without JavaScript: the up and
// down buttons, and the "move to" select, all post here with a target.
export async function moveStepAction(fd: FormData) {
  const { supabase, chainId, found } = await chainOf(fd);
  const stepId = int(fd, "step_id");
  const ids = found.steps.map((s) => s.id);
  const from = ids.indexOf(stepId);
  if (from === -1) back(`/chains/${chainId}`, { error: "That step is not in this chain." });

  const to = Math.min(Math.max(int(fd, "to") - 1, 0), ids.length - 1);
  if (to !== from) {
    ids.splice(from, 1);
    ids.splice(to, 0, stepId);
    try {
      await reorderSteps(supabase, chainId, ids);
    } catch (e) {
      back(`/chains/${chainId}`, { error: message(e) });
    }
  }
  revalidatePath(`/chains/${chainId}`);
  redirect(`/chains/${chainId}?saved=moved#step-${stepId}`);
}

// ---- generate ------------------------------------------------------

const IMAGE_TYPES: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/heic": "heic",
  "image/heif": "heif",
};
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

export async function generateAction(fd: FormData) {
  const { supabase, userId } = await requireSuperadmin();
  const chainId = int(fd, "chain_id");
  const runPath = `/chains/${chainId}/generate`;

  let requestId: number;
  try {
    const found = await getChain(supabase, chainId);
    if (!found) throw new Error("That chain no longer exists.");

    // Image: validated, stored (so the media view can show what went in),
    // then passed to the model as bytes.
    let image: { data: Buffer; mimeType: string; path: string } | null = null;
    const file = fd.get("image");
    if (file instanceof File && file.size > 0) {
      const ext = IMAGE_TYPES[file.type];
      if (!ext) throw new Error("Upload a PNG, JPEG, WebP or HEIC image.");
      if (file.size > MAX_IMAGE_BYTES) throw new Error("Images must be under 4 MB.");
      const data = Buffer.from(await file.arrayBuffer());
      const path = `chain-inputs/${chainId}/${randomUUID()}.${ext}`;
      const { error } = await supabase.storage
        .from(INPUT_BUCKET)
        .upload(path, data, { contentType: file.type, upsert: false });
      if (error) throw new Error(`Could not store the image: ${error.message}`);
      image = { data, mimeType: file.type, path };
    }

    let wing: Wing | null = null;
    const wingId = optInt(fd, "wing_id");
    if (wingId !== null) {
      const { data } = await supabase
        .from("wings")
        .select("id, slug, name, era_label, subject")
        .eq("id", wingId)
        .maybeSingle();
      wing = (data as Wing | null) ?? null;
    }

    let school: School | null = null;
    const schoolSlug = optStr(fd, "school");
    if (schoolSlug) {
      const { data } = await supabase
        .from("schools")
        .select("slug, department, name, blurb")
        .eq("slug", schoolSlug)
        .maybeSingle();
      school = (data as School | null) ?? null;
    }

    const text = rawText(fd, "input").trim() || null;
    if (found.chain.input_kind === "text" && !text) throw new Error("This chain starts from text. Type something to send it.");
    if (text && text.length > 8000) throw new Error("Keep the input under 8,000 characters.");

    const result = await runChain(supabase, userId, chainId, { text, image, wing, school });
    requestId = result.requestId;
  } catch (e) {
    back(runPath, { error: message(e) });
  }

  revalidatePath(`/chains/${chainId}/media`);
  redirect(`/runs/${requestId}`);
}
