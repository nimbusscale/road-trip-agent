// The body of Google's reply, or null when the caller should go by the status alone:
// a body that isn't JSON, or an error status whose body failed to read. Then the agent
// hears "refused with status 403" or "a response the app doesn't understand", not
// "couldn't be reached". A timeout is always passed on, even while the body is still
// being read, and so is a failed read of a good reply.
export async function jsonBodyOf(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch (error) {
    if (
      error instanceof SyntaxError ||
      (!response.ok && !isTimeoutError(error))
    ) {
      return null;
    }
    throw error;
  }
}

// What fetch throws when its AbortSignal.timeout() fires.
export function isTimeoutError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "TimeoutError";
}
