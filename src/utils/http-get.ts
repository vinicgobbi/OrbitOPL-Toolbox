import https from "https";

export interface HttpTextResult {
  status: number;
  text: string;
}

const DEFAULT_HEADERS = {
  "User-Agent": "OrbitOPL-Toolbox",
};

/** GET a URL and buffer the full response body as text. No retries — callers handle failure. */
export function httpGetText(
  url: string,
  headers?: Record<string, string>
): Promise<HttpTextResult> {
  return new Promise((resolve, reject) => {
    https
      .get(url, { headers: { ...DEFAULT_HEADERS, ...headers } }, (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () =>
          resolve({
            status: res.statusCode ?? 0,
            text: Buffer.concat(chunks).toString("utf-8"),
          })
        );
      })
      .on("error", reject);
  });
}

/** GET a URL and buffer the full response body as a Buffer (binary-safe). */
export function httpGetBuffer(
  url: string,
  headers?: Record<string, string>
): Promise<{ status: number; buffer: Buffer }> {
  return new Promise((resolve, reject) => {
    https
      .get(url, { headers: { ...DEFAULT_HEADERS, ...headers } }, (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () =>
          resolve({ status: res.statusCode ?? 0, buffer: Buffer.concat(chunks) })
        );
      })
      .on("error", reject);
  });
}

/** POST a text body to a URL and buffer the full response body as text. */
export function httpPostText(
  url: string,
  body: string,
  headers?: Record<string, string>
): Promise<HttpTextResult> {
  return new Promise((resolve, reject) => {
    const payload = Buffer.from(body, "utf-8");
    const req = https.request(
      url,
      {
        method: "POST",
        headers: {
          ...DEFAULT_HEADERS,
          ...headers,
          "Content-Length": payload.length,
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () =>
          resolve({
            status: res.statusCode ?? 0,
            text: Buffer.concat(chunks).toString("utf-8"),
          })
        );
      }
    );
    req.on("error", reject);
    req.write(payload);
    req.end();
  });
}

export async function httpGetJson<T>(
  url: string,
  headers?: Record<string, string>
): Promise<{ status: number; json: T | undefined }> {
  const { status, text } = await httpGetText(url, {
    Accept: "application/vnd.github+json",
    ...headers,
  });
  try {
    return { status, json: text ? (JSON.parse(text) as T) : undefined };
  } catch {
    return { status, json: undefined };
  }
}
