import { sanitiseSvg, svgToDataUri } from "@/lib/svg-sanitize";
import { canvasFor } from "@/lib/museum-context";

// Renders a chain output. SVG is model-generated, so it is untrusted
// markup: it is run through the allowlist sanitiser AGAIN at render time
// (it was sanitised when stored, but the stored copy is only as safe as
// whoever last wrote the row), and it is drawn through an <img> data:
// URI, where browsers never execute script. Never dangerouslySetInnerHTML.
export default function Output({
  text,
  svg,
  department,
  alt,
}: {
  text: string | null;
  svg?: string | null;
  department: string;
  alt: string;
}) {
  const source = svg ?? (text && /^\s*<svg[\s>]/i.test(text) ? text : null);

  if (source) {
    const clean = sanitiseSvg(source, canvasFor(department));
    if (!clean.ok) return <p className="status-bad">SVG not shown: {clean.reason}</p>;
    // eslint-disable-next-line @next/next/no-img-element
    return <img className="output-svg" src={svgToDataUri(clean.svg)} alt={alt} />;
  }

  if (!text) return <p className="muted">No output.</p>;
  return <p className="output-text">{text}</p>;
}
