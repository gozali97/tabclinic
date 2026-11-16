// API client — semua request ke backend Go
const API_BASE = import.meta.env.VITE_API_URL || "/api/v1";

interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: { code: string; message: string; fields?: Record<string, string> };
  meta?: { total?: number; cursor?: string };
}

class ApiError extends Error {
  code: string;
  status: number;
  fields?: Record<string, string>;
  data?: unknown;
  constructor(
    status: number,
    code: string,
    message: string,
    fields?: Record<string, string>,
    data?: unknown,
  ) {
    super(message);
    this.code = code;
    this.status = status;
    this.fields = fields;
    this.data = data;
  }
}

function fieldErrors(err: unknown): Record<string, string> {
  return err instanceof ApiError && err.fields ? err.fields : {};
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: body ? JSON.stringify(body) : undefined,
  });
  return parse<T>(res);
}

// No Content-Type: the browser sets the multipart boundary itself.
async function upload<T>(path: string, form: FormData): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    credentials: "include",
    body: form,
  });
  return parse<T>(res);
}

async function parse<T>(res: Response): Promise<T> {
  let json: ApiResponse<T>;
  try {
    json = await res.json();
  } catch {
    throw new ApiError(res.status, "UNKNOWN", "Respons server tidak valid");
  }

  if (!json.success || !res.ok) {
    throw new ApiError(
      res.status,
      json.error?.code || "UNKNOWN",
      json.error?.message || "Terjadi kesalahan",
      json.error?.fields,
      json.data,
    );
  }

  return json.data as T;
}

export const api = {
  get: <T>(path: string) => request<T>("GET", path),
  post: <T>(path: string, body?: unknown) => request<T>("POST", path, body),
  put: <T>(path: string, body?: unknown) => request<T>("PUT", path, body),
  patch: <T>(path: string, body?: unknown) => request<T>("PATCH", path, body),
  delete: <T>(path: string) => request<T>("DELETE", path),
  upload,
};

export { ApiError, fieldErrors };
export type { ApiResponse };
