import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSuperadmin } from "@/lib/guard";
import { SECTION_ROLES, getChain, listModels, type Execution, type Step } from "@/lib/chains";
import { PLACEHOLDERS } from "@/lib/museum-context";
import {
  createStepAction,
  deleteChainAction,
  deleteStepAction,
  moveStepAction,
  updateChainAction,
  updateStepAction,
} from "../../actions";
import { ChainFields, ChainTags, Crumbs, Notices, TemplateView } from "../../ui";

export default async function ChainPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; saved?: string }>;
}) {
  const { supabase } = await requireSuperadmin();
  const { id } = await params;
  const { error, saved } = await searchParams;

  const chainId = Number(id);
  if (!Number.isInteger(chainId)) notFound();

  const [found, models] = await Promise.all([getChain(supabase, chainId), listModels(supabase)]);
  if (!found) notFound();
  const { chain, steps, weight } = found;
  const seq = chain.execution === "sequential";

  return (
    <>
      <Crumbs items={[{ label: chain.slug }]} />
      <div className="page-head" style={{ marginTop: 16 }}>
        <div className="stack">
          <h1>{chain.name}</h1>
          <ChainTags chain={chain} weight={weight} />
        </div>
        <div className="card-actions">
          <Link className="btn btn-primary" href={`/chains/${chain.id}/generate`}>Generate</Link>
          <Link className="btn" href={`/chains/${chain.id}/media`}>View media</Link>
        </div>
      </div>

      <Notices error={error} saved={saved} />

      {weight !== null && weight > 0 && (
        <p className="notice">
          The museum draws this chain for live commissions (weight {weight}). Edits here change
          what the museum generates from the next commission on.
        </p>
      )}

      <div className="split">
        <div>
          <section id="steps" className="panel">
            <h2>Steps ({steps.length})</h2>
            {steps.length === 0 ? (
              <p className="empty">No steps yet. Add the first one below.</p>
            ) : (
              <ol className="steps">
                {steps.map((s, i) => (
                  <StepItem
                    key={s.id}
                    step={s}
                    index={i}
                    total={steps.length}
                    chainId={chain.id}
                    execution={chain.execution}
                    showArrow={seq && i < steps.length - 1}
                  />
                ))}
              </ol>
            )}
          </section>

          <section className="panel">
            <h2>Add a step</h2>
            <form action={createStepAction}>
              <input type="hidden" name="chain_id" value={chain.id} />
              <StepFields execution={chain.execution} />
              <div className="form-actions">
                <button className="btn btn-primary" type="submit">Add step {steps.length + 1}</button>
              </div>
            </form>
          </section>

          <section className="panel">
            <h2>Chain settings</h2>
            <form action={updateChainAction}>
              <input type="hidden" name="chain_id" value={chain.id} />
              <ChainFields chain={chain} models={models} />
              <div className="form-actions">
                <button className="btn btn-primary" type="submit">Save settings</button>
              </div>
            </form>
          </section>

          <section className="danger-zone">
            <h2>Delete this chain</h2>
            <p className="muted" style={{ fontSize: "0.78rem" }}>
              Deletes the chain, its {steps.length} steps and its museum mix row. Media it already
              generated is kept and stays visible in the admin app. Type <code>{chain.slug}</code> to confirm.
            </p>
            <form action={deleteChainAction} className="form-actions" style={{ marginTop: 0 }}>
              <input type="hidden" name="chain_id" value={chain.id} />
              <input type="text" name="confirm" aria-label="Type the chain slug to confirm" placeholder={chain.slug} style={{ maxWidth: 260 }} autoComplete="off" />
              <button className="btn btn-danger" type="submit">Delete chain</button>
            </form>
          </section>
        </div>

        <aside className="aside" aria-label="Placeholder reference">
          <h3>Placeholders</h3>
          <p className="muted">
            Write these in a template as <code>{"{{name}}"}</code>. Anything unknown is left as-is,
            so a typo shows up in the recorded prompt.
          </p>
          <dl>
            {PLACEHOLDERS.filter((p) => seq || p.when !== "sequential").map((p) => (
              <div key={p.name}>
                <dt>{p.name}</dt>
                <dd>{p.what}</dd>
              </div>
            ))}
          </dl>
        </aside>
      </div>
    </>
  );
}

function StepItem({
  step,
  index,
  total,
  chainId,
  execution,
  showArrow,
}: {
  step: Step;
  index: number;
  total: number;
  chainId: number;
  execution: Execution;
  showArrow: boolean;
}) {
  const pos = index + 1;
  return (
    <>
      <li id={`step-${step.id}`} className={`step${step.is_active ? "" : " is-off"}`}>
        <div className="step-num">
          <span className="n" aria-label={`Step ${pos}`}>{pos}</span>
          <form action={moveStepAction}>
            <input type="hidden" name="chain_id" value={chainId} />
            <input type="hidden" name="step_id" value={step.id} />
            <input type="hidden" name="to" value={pos - 1} />
            <button className="move" type="submit" disabled={pos === 1} aria-label={`Move step ${pos} up`} title="Move up">↑</button>
          </form>
          <form action={moveStepAction}>
            <input type="hidden" name="chain_id" value={chainId} />
            <input type="hidden" name="step_id" value={step.id} />
            <input type="hidden" name="to" value={pos + 1} />
            <button className="move" type="submit" disabled={pos === total} aria-label={`Move step ${pos} down`} title="Move down">↓</button>
          </form>
        </div>

        <div className="step-body">
          <div className="step-head">
            <div style={{ display: "grid", gap: 4 }}>
              <h3>{step.label}</h3>
              <div className="tags">
                <span className="tag">{step.role}</span>
                {!step.is_active && <span className="tag hot">skipped</span>}
              </div>
            </div>
            {total > 1 && (
              <form action={moveStepAction} className="inline-form">
                <input type="hidden" name="chain_id" value={chainId} />
                <input type="hidden" name="step_id" value={step.id} />
                <label className="muted" style={{ fontSize: "0.7rem" }} htmlFor={`to-${step.id}`}>Move to</label>
                <select id={`to-${step.id}`} name="to" defaultValue={pos}>
                  {Array.from({ length: total }, (_, k) => k + 1).map((n) => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                </select>
                <button className="btn btn-sm" type="submit">Go</button>
              </form>
            )}
          </div>

          <TemplateView text={step.template} />

          <details className="editor">
            <summary>Edit step</summary>
            <form action={updateStepAction} style={{ marginTop: 12 }}>
              <input type="hidden" name="chain_id" value={chainId} />
              <input type="hidden" name="step_id" value={step.id} />
              <StepFields execution={execution} step={step} />
              <div className="form-actions">
                <button className="btn btn-primary" type="submit">Save step</button>
              </div>
            </form>
            <form action={deleteStepAction} className="form-actions">
              <input type="hidden" name="chain_id" value={chainId} />
              <input type="hidden" name="step_id" value={step.id} />
              <button className="btn btn-danger btn-sm" type="submit">Delete step {pos}</button>
            </form>
          </details>
        </div>
      </li>
      {showArrow && (
        <li className="flow-arrow" aria-hidden>
          ↓ output becomes {"{{previous}}"} ↓
        </li>
      )}
    </>
  );
}

function StepFields({ execution, step }: { execution: Execution; step?: Step }) {
  return (
    <div className="form-grid">
      <label className="field">
        <span>Label</span>
        <input type="text" name="label" required maxLength={120} defaultValue={step?.label ?? ""} placeholder="Describe the image" />
      </label>
      {execution === "assembled" ? (
        <label className="field">
          <span>Section role</span>
          <select name="role" defaultValue={step?.role && step.role !== "call" ? step.role : "context"}>
            {SECTION_ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </label>
      ) : (
        <div className="field">
          <span>Role</span>
          <span className="hint">call (one model call)</span>
        </div>
      )}
      <label className="field wide">
        <span>Prompt template</span>
        <textarea
          className="template"
          name="template"
          required
          defaultValue={step?.template ?? ""}
          placeholder={
            execution === "sequential"
              ? "Here is a description of an image:\n\n{{previous}}\n\nWrite one short paragraph about what is funny in it."
              : "SUBJECT: {{wing.subject}}"
          }
        />
      </label>
      <label className="check">
        <input type="checkbox" name="is_active" defaultChecked={step?.is_active ?? true} />
        Active (inactive steps are skipped when the chain runs)
      </label>
    </div>
  );
}
