/** Fetches a file of the page and fails with its path and status when the server has none. */
async function fetchOk(path: string): Promise<Response> {
  const response = await fetch(path);
  if (!response.ok) {
    throw new Error(`GET ${path}: ${response.status}`);
  }
  return response;
}

export async function fetchBytes(path: string): Promise<ArrayBuffer> {
  const response = await fetchOk(path);
  return response.arrayBuffer();
}

export async function fetchText(path: string): Promise<string> {
  const response = await fetchOk(path);
  return response.text();
}

export async function fetchJson(path: string): Promise<unknown> {
  const response = await fetchOk(path);
  return response.json();
}
