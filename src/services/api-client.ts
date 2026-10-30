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
  constructor(message: string, readonly retryable: boolean, readonly status?: number) {
    super(message);
    this.name = "ApiError";
  }
}

async function apiRequest<T>(path: string, schema: z.ZodType<T>, options: {
  method: "GET" | "POST" | "PATCH" | "DELETE"; body?: unknown; signal?: AbortSignal; getToken?: () => Promise<string | null>;
}): Promise<T> {
  const { signal, getToken } = options;
  signal?.throwIfAborted();
  const base = BaseUrlSchema.safeParse(process.env.NEXT_PUBLIC_API_BASE_URL);
  if (!base.success) throw new ApiError("The service connection is not configured.", false);
  const url = new URL(path, base.data);
  if (url.origin !== base.data) throw new ApiError("The service address is invalid.", false);
  const headers = new Headers({ Accept: "application/json" });
  if (options.body !== undefined) headers.set("Content-Type", "application/json");
  if (getToken) {
    let token: string | null;
    try { token = await getToken(); }
    catch { throw new ApiError("Unable to verify your session. Please try again.", false); }
    if (!token) throw new ApiError("Please sign in to continue.", false, 401);
    headers.set("Authorization", `Bearer ${token}`);
  }
  signal?.throwIfAborted();
  const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(url, {
      method: options.method,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      headers,
      cache: "no-store",
      credentials: "omit",
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new ApiError("Unable to connect. Check your connection and try again.", true);
  }
  if (response.status === 401) throw new ApiError("Your session could not be verified. Please sign in again.", false, 401);
  if (response.status === 404) throw new ApiError("This item could not be found.", false, 404);
  if (response.status === 409) {
    const details = z.object({ code: z.literal("CHAT_BUSY"), message: z.string().min(1).max(300) }).safeParse(await response.json().catch(() => null));
    throw new ApiError(details.success ? details.data.message : "This request conflicts with an earlier change. Refresh and try again.", false, 409);
  }
  if (response.status === 400 || response.status === 413 || response.status === 415) {
    const details = z.object({ code: z.enum(["UPLOAD_QUOTA", "ATTACHMENT_UNAVAILABLE"]), message: z.string().min(1).max(300) }).safeParse(await response.json().catch(() => null));
    throw new ApiError(details.success ? details.data.message : "Check the request details and try again.", false, response.status);
  }
  if (response.status === 402) {
    const error = z.object({ message: z.string().min(1).max(300) }).safeParse(await response.json().catch(() => null));
    throw new ApiError(error.success ? error.data.message : "There are not enough credits for this task.", false, 402);
  }
  if (!response.ok) {
    throw new ApiError("The service is unavailable. Please try again.", response.status >= 500 || response.status === 429, response.status);
  }
  let body: unknown;
  try { body = await response.json(); }
  catch (error) {
    if (signal?.aborted) throw error;
    throw new ApiError("The service returned an unreadable response.", false);
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw new ApiError("The service returned an unexpected response.", false);
  return parsed.data;
}

export function apiGet<T>(path: string, schema: z.ZodType<T>, signal?: AbortSignal, getToken?: () => Promise<string | null>) {
  return apiRequest(path, schema, { method: "GET", signal, getToken });
}

export function apiPost<T>(path: string, schema: z.ZodType<T>, body: unknown, getToken: () => Promise<string | null>, signal?: AbortSignal) {
  return apiRequest(path, schema, { method: "POST", body, getToken, signal });
}

export function apiPatch<T>(path: string, schema: z.ZodType<T>, body: unknown, getToken: () => Promise<string | null>, signal?: AbortSignal) {
  return apiRequest(path, schema, { method: "PATCH", body, getToken, signal });
}
export function apiDelete<T>(path: string, schema: z.ZodType<T>, getToken: () => Promise<string | null>, signal?: AbortSignal) {
  return apiRequest(path, schema, { method: "DELETE", getToken, signal });
}
