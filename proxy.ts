import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

// Next.js 16 calls this proxy.ts; on 15 and earlier the file is
// middleware.ts and the export is `middleware`. The logic is identical.
export async function proxy(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  // Everything except static assets. Note what is NOT excluded: there
  // is no route in this app that the gate skips except the four public
  // paths named in lib/supabase/proxy.ts.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
