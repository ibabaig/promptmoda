import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSuperadmin } from "@/lib/guard";
import { getChain } from "@/lib/chains";
import { listRuns, publicImageUrl } from "@/lib/runs";
import Output from "../../../output";
import { ChainTags, Crumbs, secs, when } from "../../../ui";

// Everything this chain has produced: test runs made in this tool, and
// works the museum generated with it (house and member commissions).
export default async function MediaPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ show?: string }>;
}) {
  const { supabase } = await requireSuperadmin();
  const { id } = await params;
  const { show } = await searchParams;
  const chainId = Number(id);
  if (!Number.isInteger(chainId)) notFound();

  const found = await getChain(supabase, chainId);
  if (!found) notFound();
  const { chain, weight } = found;

  const { runs, works } = await listRuns(supabase, chainId);
  const filter = show === "tool" || show === "museum" || show === "failed" ? show : "all";
  const shown = runs.filter((r) =>
    filter === "all" ? true
      : filter === "tool" ? r.origin === "tool"
      : filter === "museum" ? r.origin !== "tool"
      : r.status === "failed"
  );

  const tabs: [string, string][] = [["all", "All"], ["tool", "Tool runs"], ["museum", "Museum works"], ["failed", "Failed"]];

  return (
    <>
      <Crumbs items={[{ href: `/chains/${chain.id}`, label: chain.slug }, { label: "Media" }]} />
      <div className="page-head" style={{ marginTop: 16 }}>
        <div className="stack">
          <p className="eyebrow">Media made by</p>
          <h1>{chain.name}</h1>
          <ChainTags chain={chain} weight={weight} />
        </div>
        <Link className="btn btn-primary" href={`/chains/${chain.id}/generate`}>Generate</Link>
      </div>

      <nav className="crumbs" aria-label="Filter" style={{ paddingTop: 0, marginBottom: 20 }}>
        {tabs.map(([key, label]) => (
          <Link
            key={key}
            href={key === "all" ? `/chains/${chain.id}/media` : `/chains/${chain.id}/media?show=${key}`}
            aria-current={filter === key ? "page" : undefined}
            style={filter === key ? { borderBottomColor: "var(--signal)", color: "var(--signal-text)" } : undefined}
          >
            {label} ({runs.filter((r) =>
              key === "all" ? true : key === "tool" ? r.origin === "tool" : key === "museum" ? r.origin !== "tool" : r.status === "failed"
            ).length})
          </Link>
        ))}
      </nav>

      {shown.length === 0 ? (
        <p className="empty">
          Nothing here yet. <Link href={`/chains/${chain.id}/generate`}>Generate something</Link>.
        </p>
      ) : (
        <div className="media-grid">
          {shown.map((r) => {
            const work = r.work_id ? works.get(r.work_id) ?? null : null;
            return (
              <article className="media-card" key={r.id}>
                <div className="meta">
                  <span>{r.origin === "tool" ? "Tool run" : `Museum · ${r.origin}`}</span>
                  <span className={r.status === "succeeded" ? "status-ok" : r.status === "failed" ? "status-bad" : ""}>
                    {r.status}
                  </span>
                </div>
                {r.input_image_path && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img className="input-thumb" src={publicImageUrl(supabase, r.input_image_path)} alt="The image this run started from" />
                )}
                <div className="body">
                  {r.input_text && <p className="muted" style={{ fontSize: "0.76rem" }}>In: {r.input_text.slice(0, 160)}</p>}
                  {work ? (
                    <>
                      {work.title && <h3>{work.title}</h3>}
                      <Output text={work.body} svg={work.svg_source} department={work.department} alt={work.title ?? "Generated work"} />
                    </>
                  ) : r.status === "failed" ? (
                    <p className="status-bad" style={{ fontSize: "0.8rem" }}>{r.failure_reason ?? "Failed."}</p>
                  ) : (
                    <Output text={r.output_text} department={r.department} alt={`Output of run ${r.id}`} />
                  )}
                </div>
                <div className="foot stat-row">
                  <span>{when(r.created_at)}</span>
                  <span>{secs(r.duration_ms)}</span>
                  {r.school && <span>{r.school}</span>}
                  <Link href={`/runs/${r.id}`}>Trace →</Link>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </>
  );
}
