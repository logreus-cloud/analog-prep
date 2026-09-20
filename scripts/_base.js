export const BASE = (process.env.BASE_URL || 'http://localhost:3000').replace(/\/$/, '');

export async function get(path) {
  const res = await fetch(BASE + path);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || res.status);
  return data;
}

export async function post(path, body) {
  const res = await fetch(BASE + path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || res.status);
  return data;
}
