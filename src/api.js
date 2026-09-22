export async function api(path, data, signal) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 55000);
  const abort = () => controller.abort();
  signal?.addEventListener('abort', abort, { once: true });
  try {
    if (!navigator.onLine) throw new Error('You’re offline. Your saved words and reviews still work.');
    const response = await fetch(`/api/${path}`, {
      method: data === undefined ? 'GET' : 'POST', credentials: 'same-origin',
      headers: data === undefined ? {} : { 'Content-Type': 'application/json' },
      body: data === undefined ? undefined : JSON.stringify(data), signal: controller.signal,
    });
    const payload = await response.json().catch(() => { throw new Error('The AI server is unavailable. Try again shortly.'); });
    if (!response.ok) throw new Error(payload.error || 'The request could not be completed.');
    return payload;
  } catch (error) {
    if (error.name === 'AbortError') throw new Error('The request timed out. Please try again.');
    throw error;
  } finally { clearTimeout(timer); signal?.removeEventListener('abort', abort); }
}
