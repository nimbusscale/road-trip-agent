// Reply bodies that fail partway through, for the Google clients' tests.

// Fails the way fetch's timeout makes a body fail.
export function bodyThatTimesOut(): ReadableStream<Uint8Array> {
  return bodyThatFailsWith(new DOMException("timed out", "TimeoutError"));
}

// Fails the way undici fails a body when the connection drops.
export function bodyThatBreaks(): ReadableStream<Uint8Array> {
  return bodyThatFailsWith(new TypeError("terminated"));
}

function bodyThatFailsWith(error: Error): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      controller.error(error);
    },
  });
}
