// The body of Google's reply, or null when it isn't JSON, so the caller reports a
// response it doesn't understand. Any other failure is passed on, such as the timeout
// firing while the body is still being read.
export async function jsonBodyOf(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch (error) {
    if (error instanceof SyntaxError) {
      return null;
    }
    throw error;
  }
}
