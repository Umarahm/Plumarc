import { send } from "@/lib/api";
import { parseAction } from "@/lib/manage-actions";

// proxy.ts has already checked the session, origin and CSRF token. The backend
// checks that the user may make the change.
export async function POST(request: Request) {
  const form = await request.formData().catch(() => null);
  const action = form && parseAction(form);
  if (!action) return new Response("Bad request", { status: 400 });

  const error = await send(action);
  const location = error ? `${action.back}?error=${error}` : (action.done ?? action.back);
  // 303 makes the browser load the page with GET, so a reload repeats nothing.
  return new Response(null, { status: 303, headers: { Location: location } });
}
