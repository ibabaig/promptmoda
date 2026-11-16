import Link from "next/link";
import { Fragment } from "react";
import {
  DEPARTMENTS,
  EXECUTIONS,
  INPUT_KINDS,
  MEDIA,
  type Chain,
  type Model,
} from "@/lib/chains";

// Server-rendered building blocks shared by the pages. No client state.

const SAVED: Record<string, string> = {
  created: "Chain created. Add its steps below.",
  chain: "Chain settings saved.",
  "step-added": "Step added at the end. Move it into place with the arrows.",
  step: "Step saved.",
  "step-deleted": "Step deleted. The steps after it moved up.",
  moved: "Step moved.",
};

export function Notices({ error, saved, deleted }: { error?: string; saved?: string; deleted?: string }) {
  return (
    <>
      {error && <p className="notice error" role="alert">{error}</p>}
      {saved && SAVED[saved] && <p className="notice ok" role="status">{SAVED[saved]}</p>}
      {deleted && <p className="notice ok" role="status">Deleted chain {deleted}. Its past runs are kept.</p>}
    </>
  );
}

export function Crumbs({ items }: { items: { href?: string; label: string }[] }) {
  return (
    <nav className="crumbs" aria-label="Breadcrumb">
      <Link href="/">All chains</Link>
      {items.map((it, i) => (
        <Fragment key={i}>
          <span aria-hidden>/</span>
          {it.href ? <Link href={it.href}>{it.label}</Link> : <span>{it.label}</span>}
        </Fragment>
      ))}
    </nav>
  );
}

// Highlights {{placeholders}} so a curator can see at a glance what a
// step pulls in.
export function TemplateView({ text }: { text: string }) {
  const parts = text.split(/(\{\{[a-zA-Z0-9_.]+\}\})/g);
  return (
    <pre className="template-view">
      {parts.map((p, i) =>
        /^\{\{.+\}\}$/.test(p) ? <span key={i} className="ph">{p}</span> : <Fragment key={i}>{p}</Fragment>
      )}
    </pre>
  );
}

export function ChainTags({ chain, weight }: { chain: Chain; weight: number | null }) {
  return (
    <div className="tags">
      <span className={`tag ${chain.execution === "sequential" ? "hot" : "strong"}`}>{chain.execution}</span>
      <span className="tag">{chain.department}</span>
      <span className="tag">{chain.media}</span>
      {chain.input_kind !== "none" && <span className="tag">{chain.input_kind} in</span>}
      {!chain.is_active && <span className="tag hot">inactive</span>}
      {weight !== null && weight > 0 && <span className="tag strong">museum weight {weight}</span>}
    </div>
  );
}

const EXEC_HELP: Record<string, string> = {
  sequential: "Each step is its own model call. Step N reads step N-1 as {{previous}}.",
  assembled: "Each step is a section of ONE prompt, joined in order. This is how the museum chains work.",
};

export function ChainFields({ chain, models }: { chain?: Chain; models: Model[] }) {
  const d = chain;
  return (
    <div className="form-grid">
      <label className="field">
        <span>Name</span>
        <input type="text" name="name" required maxLength={120} defaultValue={d?.name ?? ""} placeholder="Image to five captions" />
      </label>
      <label className="field">
        <span>Slug</span>
        <input type="text" name="slug" required maxLength={80} pattern="[a-z0-9]+(-[a-z0-9]+)*" defaultValue={d?.slug ?? ""} placeholder="image-captions-v2" />
        <span className="hint">Lowercase and hyphens. Unique.</span>
      </label>
      <label className="field">
        <span>Execution</span>
        <select name="execution" defaultValue={d?.execution ?? "sequential"}>
          {EXECUTIONS.map((x) => <option key={x} value={x}>{x}</option>)}
        </select>
        <span className="hint">{EXEC_HELP.sequential} {EXEC_HELP.assembled}</span>
      </label>
      <label className="field">
        <span>Input</span>
        <select name="input_kind" defaultValue={d?.input_kind ?? "none"}>
          {INPUT_KINDS.map((x) => <option key={x} value={x}>{x === "none" ? "none (no input)" : x}</option>)}
        </select>
        <span className="hint">An image is attached to the first call only.</span>
      </label>
      <label className="field">
        <span>Department</span>
        <select name="department" defaultValue={d?.department ?? "humour"}>
          {DEPARTMENTS.map((x) => <option key={x} value={x}>{x}</option>)}
        </select>
      </label>
      <label className="field">
        <span>Output media</span>
        <select name="media" defaultValue={d?.media ?? "text"}>
          {MEDIA.map((x) => <option key={x} value={x}>{x}</option>)}
        </select>
        <span className="hint">SVG output is sanitised before it is shown.</span>
      </label>
      <label className="field">
        <span>Model</span>
        <select name="model_id" defaultValue={d?.model_id ? String(d.model_id) : ""}>
          <option value="">Default (gemini-flash-latest)</option>
          {models.map((m) => (
            <option key={m.id} value={m.id}>{m.display_name} · {m.slug}{m.is_active ? "" : " (inactive)"}</option>
          ))}
        </select>
      </label>
      <label className="field">
        <span>Temperature</span>
        <input type="number" name="temperature" min={0} max={2} step={0.05} defaultValue={d?.temperature ?? ""} placeholder="model default" />
      </label>
      <label className="field">
        <span>Max output tokens</span>
        <input type="number" name="max_output_tokens" min={256} max={65536} step={1} defaultValue={d?.max_output_tokens ?? ""} placeholder="model default" />
        <span className="hint">Thinking and output share this. Text 2400+, SVG 9000+.</span>
      </label>
      <label className="field wide">
        <span>Notes</span>
        <textarea name="notes" rows={2} style={{ minHeight: "3.5rem" }} defaultValue={d?.notes ?? ""} />
      </label>
      <label className="check">
        <input type="checkbox" name="is_active" defaultChecked={d?.is_active ?? true} />
        Active
      </label>
    </div>
  );
}

export function when(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/New_York",
  });
}

export function secs(ms: number | null): string {
  return ms === null ? "—" : `${(ms / 1000).toFixed(1)}s`;
}
