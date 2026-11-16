// Small, strict readers for FormData. Every server action validates
// here before anything reaches the database; the database then checks
// again with its own constraints.

export function str(fd: FormData, key: string): string {
  const v = fd.get(key);
  return typeof v === "string" ? v.trim() : "";
}

export function optStr(fd: FormData, key: string): string | null {
  const v = str(fd, key);
  return v === "" ? null : v;
}

// Templates keep their whitespace exactly: line breaks are load-bearing
// in haiku and in the numbered-list instructions. Only Windows line
// endings are normalised.
export function rawText(fd: FormData, key: string): string {
  const v = fd.get(key);
  return typeof v === "string" ? v.replace(/\r\n/g, "\n") : "";
}

export function int(fd: FormData, key: string): number {
  const n = Number(str(fd, key));
  if (!Number.isInteger(n)) throw new Error(`${key} must be a whole number.`);
  return n;
}

export function optInt(fd: FormData, key: string): number | null {
  const v = str(fd, key);
  if (v === "") return null;
  const n = Number(v);
  if (!Number.isInteger(n)) throw new Error(`${key} must be a whole number.`);
  return n;
}

export function optNum(fd: FormData, key: string): number | null {
  const v = str(fd, key);
  if (v === "") return null;
  const n = Number(v);
  if (!Number.isFinite(n)) throw new Error(`${key} must be a number.`);
  return n;
}

export function bool(fd: FormData, key: string): boolean {
  return fd.get(key) === "on";
}

export function oneOf<T extends string>(fd: FormData, key: string, allowed: readonly T[]): T {
  const v = str(fd, key);
  if (!(allowed as readonly string[]).includes(v)) {
    throw new Error(`${key} must be one of: ${allowed.join(", ")}.`);
  }
  return v as T;
}
