import Link from "next/link";
import { requireSuperadmin } from "@/lib/guard";
import { DEPARTMENTS, listChains } from "@/lib/chains";
import { ChainTags, Notices } from "./ui";

export default async function ChainsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; deleted?: string }>;
}) {
  const { supabase } = await requireSuperadmin();
  const { error, deleted } = await searchParams;
  const chains = await listChains(supabase);

  return (
    <>
      <div className="page-head">
        <div className="stack">
          <p className="eyebrow">{chains.length} chains</p>
          <h1>Prompt chains</h1>
          <p className="lede">
            A chain is an ordered list of prompt steps. Sequential chains pass each step&apos;s
            output to the next; assembled chains join their steps into one prompt, the way the
            museum generates its daily works.
          </p>
        </div>
        <Link className="btn btn-primary" href="/chains/new">+ New chain</Link>
      </div>

      <Notices error={error} deleted={deleted} />

      {chains.length === 0 && <p className="empty">No chains yet.</p>}

      {DEPARTMENTS.map((dept) => {
        const group = chains.filter((c) => c.department === dept);
        if (group.length === 0) return null;
        return (
          <section key={dept}>
            <div className="group-head">
              <h2>{dept}</h2>
              <span className="muted">{group.length}</span>
            </div>
            <div className="chain-grid">
              {group.map((c) => (
                <article className="card" key={c.id}>
                  <p className="eyebrow"><code>{c.slug}</code></p>
                  <h2><Link href={`/chains/${c.id}`}>{c.name}</Link></h2>
                  <ChainTags chain={c} weight={c.weight} />
                  <div className="stat-row">
                    <span><strong>{c.step_count}</strong> steps</span>
                    <span><strong>{c.run_count}</strong> generations</span>
                  </div>
                  {c.notes && <p className="muted" style={{ fontSize: "0.78rem" }}>{c.notes}</p>}
                  <div className="card-actions">
                    <Link className="btn btn-sm" href={`/chains/${c.id}`}>Edit</Link>
                    <Link className="btn btn-sm" href={`/chains/${c.id}/generate`}>Generate</Link>
                    <Link className="btn btn-sm" href={`/chains/${c.id}/media`}>Media</Link>
                  </div>
                </article>
              ))}
            </div>
          </section>
        );
      })}
    </>
  );
}
