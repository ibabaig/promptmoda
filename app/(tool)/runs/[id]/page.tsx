import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSuperadmin } from "@/lib/guard";
import { getRun, publicImageUrl } from "@/lib/runs";
import Output from "../../output";
import { Crumbs, secs, when } from "../../ui";

// One run, call by call: what each step was sent and what it returned.
// This is the page that answers "why did step 3 say that?".
export default async function RunPage({ params }: { params: Promise<{ id: string }> }) {
  const { supabase } = await requireSuperadmin();
  const { id } = await params;
  const runId = Number(id);
  if (!Number.isInteger(runId)) notFound();

  const found = await getRun(supabase, runId);
  if (!found) notFound();
  const { run, responses, work } = found;

  let chainSlug: string | null = null;
  if (run.chain_id) {
    const { data } = await supabase.from("prompt_chains").select("slug").eq("id", run.chain_id).maybeSingle();
    chainSlug = (data as { slug: string } | null)?.slug ?? null;
  }

  const crumbs = run.chain_id && chainSlug
    ? [
        { href: `/chains/${run.chain_id}`, label: chainSlug },
        { href: `/chains/${run.chain_id}/media`, label: "Media" },
        { label: `Run ${run.id}` },
      ]
    : [{ label: `Run ${run.id}` }];

  return (
    <>
      <Crumbs items={crumbs} />
      <div className="page-head" style={{ marginTop: 16 }}>
        <div className="stack">
          <p className="eyebrow">
            {run.origin === "tool" ? "Tool run" : `Museum ${run.origin} commission`} · {when(run.created_at)} ·{" "}
            {secs(run.duration_ms)}
          </p>
          <h1>Run {run.id}</h1>
          <p className={run.status === "succeeded" ? "status-ok" : run.status === "failed" ? "status-bad" : ""}>
            {run.status.toUpperCase()}
            {run.failure_reason ? ` — ${run.failure_reason}` : ""}
          </p>
        </div>
        {run.chain_id && (
          <Link className="btn btn-primary" href={`/chains/${run.chain_id}/generate`}>Run again</Link>
        )}
      </div>

      <div className="split">
        <section className="panel" aria-labelledby="final">
          <h2 id="final">Final output</h2>
          {work ? (
            <Output text={work.body} svg={work.svg_source} department={work.department} alt={work.title ?? "Generated work"} />
          ) : (
            <Output text={run.output_text} department={run.department} alt={`Output of run ${run.id}`} />
          )}
        </section>
        <aside className="aside">
          <h3>Input</h3>
          {run.input_image_path && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={publicImageUrl(supabase, run.input_image_path)} alt="The image this run started from" style={{ width: "100%", border: "1px solid var(--rule)" }} />
          )}
          {run.input_text ? <p style={{ whiteSpace: "pre-wrap" }}>{run.input_text}</p> : !run.input_image_path && <p className="muted">No input.</p>}
          {run.school && <p className="muted">School: {run.school}</p>}
        </aside>
      </div>

      <h2 style={{ margin: "8px 0 14px" }}>Calls ({responses.length})</h2>
      {responses.length === 0 ? (
        <p className="empty">No model calls were recorded for this run.</p>
      ) : (
        <ol className="trace">
          {responses.map((r, i) => (
            <li key={r.id}>
              <div className="trace-head">
                <span>{r.step_order ? `Step ${r.step_order}` : `Call ${i + 1}`}</span>
                <span>
                  {r.finish_reason ?? "—"} · {secs(r.duration_ms)} · in {r.prompt_tokens ?? "?"} / think{" "}
                  {r.thought_tokens ?? 0} / out {r.output_tokens ?? "?"}
                  {r.sanitiser_ok === false ? ` · SVG rejected: ${r.sanitiser_reason}` : ""}
                </span>
              </div>
              <div className="trace-body">
                <div>
                  <span className="eyebrow">Sent</span>
                  <pre>{r.prompt_text ?? run.prompt_text ?? "(not recorded)"}</pre>
                </div>
                <div>
                  <span className="eyebrow">Returned</span>
                  <pre>{r.raw_text ?? "(empty)"}</pre>
                </div>
              </div>
            </li>
          ))}
        </ol>
      )}
    </>
  );
}
