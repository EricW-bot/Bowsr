export async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number
): Promise<Response> {
  // Some React Native runtimes don't reliably abort `fetch`, so we also
  // race against a timeout promise to guarantee we don't hang.
  const controller = new AbortController();

  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => {
      controller.abort();
      reject(new Error(`Request timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });

  try {
    return await Promise.race([fetch(url, { ...init, signal: controller.signal }), timeoutPromise]);
  } finally {
    // No-op: the timeoutPromise timer is bounded by `timeoutMs`.
    // `controller.abort()` is invoked by the timer as well.
  }
}
