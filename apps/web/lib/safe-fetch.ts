/**
 * Safe response handling for auth calls.
 *
 * A proxy / crashed backend answers with plain text ("Internal Server Error"),
 * and calling res.json() on that throws "Unexpected token 'I' ... is not valid
 * JSON" — a message no user should ever see. These helpers check the status and
 * only parse JSON when the response really is JSON.
 */
export const SERVER_ERROR_MESSAGE = "Server error, please try again";
export const NETWORK_ERROR_MESSAGE = "Can't reach the server. Check your connection and try again.";

export interface SafeResult<T> {
  ok: boolean;
  status: number;
  /** Parsed JSON body, or null when the response was empty / not JSON. */
  data: T | null;
}

/** Read a response without ever throwing on a non-JSON body. */
export async function readJsonSafely<T = unknown>(res: Response): Promise<SafeResult<T>> {
  let data: T | null = null;
  const type = res.headers.get("content-type") ?? "";
  if (res.status !== 204 && type.includes("json")) {
    try {
      data = (await res.json()) as T;
    } catch {
      data = null;
    }
  }
  return { ok: res.ok, status: res.status, data };
}

/** A message that is safe to show: the server's own text for 4xx, a generic one otherwise. */
export function friendlyMessage(result: SafeResult<unknown>): string {
  if (result.status >= 500 || result.status === 0) return SERVER_ERROR_MESSAGE;
  const message = (result.data as { message?: unknown } | null)?.message;
  if (typeof message === "string" && message.trim()) return message;
  return result.status === 401 || result.status === 403 ? "Invalid credentials" : SERVER_ERROR_MESSAGE;
}
