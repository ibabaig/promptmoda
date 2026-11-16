import { requireSuperadmin } from "@/lib/guard";
import { listModels } from "@/lib/chains";
import { createChainAction } from "../../actions";
import { ChainFields, Crumbs, Notices } from "../../ui";

export default async function NewChainPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { supabase } = await requireSuperadmin();
  const { error } = await searchParams;
  const models = await listModels(supabase);

  return (
    <>
      <Crumbs items={[{ label: "New chain" }]} />
      <div className="page-head" style={{ marginTop: 16 }}>
        <h1>New chain</h1>
      </div>
      <Notices error={error} />
      <form className="panel" action={createChainAction}>
        <h2>Settings</h2>
        <ChainFields models={models} />
        <p className="muted" style={{ marginTop: 14, fontSize: "0.76rem" }}>
          A new chain joins the museum mix at weight 0, so it never changes what the museum
          generates until someone deliberately dials it up in the admin app. Sequential chains
          cannot be dialled up at all.
        </p>
        <div className="form-actions">
          <button className="btn btn-primary" type="submit">Create chain</button>
        </div>
      </form>
    </>
  );
}
