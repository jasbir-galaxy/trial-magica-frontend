import { z } from "zod";

const REQUEST_TIMEOUT_MS = 10_000;
const BaseUrlSchema = z.url().refine((value) => {
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) && url.origin === value;
  } catch {
    return false;
  }
});

export class ApiError extends Error {
  constructor(message: string, readonly retryable: boolean) {
    super(message);
    this.name = "ApiError";
  }
}

export async function apiGet<T>(path: string, schema: z.ZodType<T>, signal?: AbortSignal): Promise<T> {
  const base = BaseUrlSchema.safeParse(process.env.NEXT_PUBLIC_API_BASE_URL);
  if (!base.success) throw new ApiError("The service connection is not configured.", false);
  const url = new URL(path, base.data);
  if (url.origin !== base.data) throw new ApiError("The service address is invalid.", false);
  const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(url, {
      headers: { Accept: "application/json" },
      cache: "no-store",
      credentials: "omit",
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new ApiError("Unable to connect. Check your connection and try again.", true);
  }
  if (!response.ok) {
    throw new ApiError("The service is unavailable. Please try again.", response.status >= 500 || response.status === 429);
  }
  let body: unknown;
  try { body = await response.json(); }
  catch { throw new ApiError("The service returned an unreadable response.", false); }
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw new ApiError("The service returned an unexpected response.", false);
  return parsed.data;
}
