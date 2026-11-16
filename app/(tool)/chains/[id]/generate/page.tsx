import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSuperadmin } from "@/lib/guard";
import { getChain } from "@/lib/chains";
import type { School, Wing } from "@/lib/museum-context";
import { generateAction } from "../../../actions";
import { ChainTags, Crumbs, Notices } from "../../../ui";
import SubmitButton from "./submit-button";

// The generate action is a server action posted from this page, and it
// inherits this page's limit. A sequential chain is one model call per
// step, and a thinking model can take 20-40s per call.
export const maxDuration = 300;

export default async function GeneratePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { supabase } = await requireSuperadmin();
  const { id } = await params;
  const { error } = await searchParams;
  const chainId = Number(id);
  if (!Number.isInteger(chainId)) notFound();

  const found = await getChain(supabase, chainId);
  if (!found) notFound();
  const { chain, steps, weight } = found;
  const active = steps.filter((s) => s.is_active);

  // Only offer the museum context a chain actually uses.
  const all = active.map((s) => s.template).join("\n");
  const usesWing = /\{\{wing\./.test(all);
  const usesSchool = /\{\{school\./.test(all) || /\{\{examples\}\}/.test(all);

  const [wingsRes, schoolsRes] = await Promise.all([
    usesWing
      ? supabase.from("wings").select("id, slug, name, era_label, subject").eq("is_active", true).order("sort_order")
      : Promise.resolve({ data: [] }),
    usesSchool
      ? supabase.from("schools").select("slug, department, name, blurb").eq("department", chain.department).order("sort_order")
      : Promise.resolve({ data: [] }),
  ]);
  const wings = (wingsRes.data ?? []) as unknown as Wing[];
  const schools = (schoolsRes.data ?? []) as unknown as School[];

  return (
    <>
      <Crumbs items={[{ href: `/chains/${chain.id}`, label: chain.slug }, { label: "Generate" }]} />
      <div className="page-head" style={{ marginTop: 16 }}>
        <div className="stack">
          <p className="eyebrow">Generate</p>
          <h1>{chain.name}</h1>
          <ChainTags chain={chain} weight={weight} />
        </div>
        <Link className="btn" href={`/chains/${chain.id}/media`}>Past media</Link>
      </div>

      <Notices error={error} />

      {active.length === 0 ? (
        <p className="empty">
          This chain has no active steps. <Link href={`/chains/${chain.id}`}>Add one</Link> first.
        </p>
      ) : (
        <div className="split">
          <form className="panel" action={generateAction}>
            <input type="hidden" name="chain_id" value={chain.id} />
            <h2>Input</h2>
            <div className="form-grid">
              {chain.input_kind === "image" && (
                <label className="field wide">
                  <span>Image</span>
                  <input type="file" name="image" accept="image/png,image/jpeg,image/webp,image/heic,image/heif" required />
                  <span className="hint">PNG, JPEG, WebP or HEIC, under 4 MB. Sent to step 1 and stored with the run.</span>
                </label>
              )}
              <label className="field wide">
                <span>{chain.input_kind === "text" ? "Text" : "Text (optional)"}</span>
                <textarea
                  name="input"
                  rows={4}
                  style={{ minHeight: "5rem" }}
                  required={chain.input_kind === "text"}
                  placeholder="Available to every step as {{input}}."
                />
              </label>
              {usesWing && (
                <label className="field">
                  <span>Wing</span>
                  <select name="wing_id" defaultValue={wings[0]?.id ?? ""}>
                    {wings.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
                  </select>
                  <span className="hint">Fills {"{{wing.*}}"}.</span>
                </label>
              )}
              {usesSchool && (
                <label className="field">
                  <span>School</span>
                  <select name="school" defaultValue={schools[0]?.slug ?? ""}>
                    <option value="">None</option>
                    {schools.map((s) => <option key={s.slug} value={s.slug}>{s.name}</option>)}
                  </select>
                  <span className="hint">Fills {"{{school.*}}"} and picks examples.</span>
                </label>
              )}
            </div>
            <div className="form-actions">
              <SubmitButton steps={chain.execution === "sequential" ? active.length : 1} />
            </div>
          </form>

          <aside className="aside">
            <h3>What will run</h3>
            {chain.execution === "sequential" ? (
              <ol style={{ margin: 0, paddingLeft: 18, display: "grid", gap: 6 }}>
                {active.map((s, i) => (
                  <li key={s.id}>
                    {s.label}
                    {i === 0 && chain.input_kind === "image" && <span className="muted"> · sees the image</span>}
                  </li>
                ))}
              </ol>
            ) : (
              <p>
                {active.length} sections joined into one prompt, sent as one call.
              </p>
            )}
            <p className="muted">
              {chain.execution === "sequential" ? `${active.length} model calls.` : "1 model call."} Every
              call is recorded with its prompt, output, tokens and timing.
            </p>
          </aside>
        </div>
      )}
    </>
  );
}
