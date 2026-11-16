"use client";

import { useFormStatus } from "react-dom";

// A run takes tens of seconds. Without this the button looks dead and
// the obvious response is to click it again, which starts a second run.
export default function SubmitButton({ steps }: { steps: number }) {
  const { pending } = useFormStatus();
  return (
    <>
      <button className="btn btn-primary" type="submit" disabled={pending}>
        {pending ? "Generating…" : "Generate"}
      </button>
      {pending && (
        <span className="muted" role="status" style={{ fontSize: "0.76rem" }}>
          Running {steps} {steps === 1 ? "call" : "calls in sequence"}. This can take a minute.
        </span>
      )}
    </>
  );
}
