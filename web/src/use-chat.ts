import {
  type Dispatch,
  useCallback,
  useEffect,
  useReducer,
  useRef,
  useState,
} from "react";

import { sessionResponseSchema } from "../../src/shared/session.schema";
import type { ChatEvent } from "../../src/shared/session.schema";
import { ApiError, callApi, sendMessage } from "./api-client";
import {
  type ChatAction,
  chatReducer,
  type ChatState,
  CUT_OFF,
  EMPTY_CHAT,
} from "./chat-state";
import { replaceAddress, type Route } from "./route";

// How the chat view was opened: the "New trip" form, "start a new session" on a trip,
// or a session to resume.
export type ChatStart = Extract<
  Route,
  { page: "newTrip" | "newSession" | "session" }
>;

// How often the view asks whether a turn it didn't see the end of has ended.
const CHECK_AGAIN_MS = 3000;

export interface Chat {
  state: ChatState;
  // Null until the trip exists.
  tripId: string | null;
  send: (text: string) => void;
}

export function useChat(start: ChatStart): Chat {
  const [state, dispatch] = useReducer(chatReducer, EMPTY_CHAT);
  const [tripId, setTripId] = useState(
    start.page === "newSession" ? start.tripId : null,
  );
  const sessionIdRef = useRef(
    start.page === "session" ? start.sessionId : null,
  );

  useResume(start, dispatch, setTripId);
  // Only a resumed session can have a turn this view didn't start.
  useCheckRunningTurn(
    state.turnRunning,
    start.page === "session" ? start.sessionId : null,
    dispatch,
  );

  const send = useCallback(
    (text: string) => {
      dispatch({ type: "sent", text });
      const onEvent = (event: ChatEvent): void => {
        if (event.name === "session") {
          sessionIdRef.current = event.data.sessionId;
          setTripId(event.data.tripId);
          replaceAddress({ page: "session", sessionId: event.data.sessionId });
        }
        dispatch({ type: "event", event });
      };
      void sendMessage(
        pathFor(start, sessionIdRef.current),
        text,
        onEvent,
      ).then(
        () => {
          dispatch({ type: "closed" });
        },
        (error: unknown) => {
          dispatch({ type: "failed", message: messageOf(error, CUT_OFF) });
        },
      );
    },
    [start],
  );

  return { state, tripId, send };
}

// Opening a session resumes it: the server tells the coordinator so on the next
// message (functional spec 10.1).
function useResume(
  start: ChatStart,
  dispatch: Dispatch<ChatAction>,
  setTripId: (tripId: string) => void,
): void {
  useEffect(() => {
    if (start.page !== "session") {
      return undefined;
    }
    const controller = new AbortController();
    void callApi(
      `/api/sessions/${start.sessionId}/resume`,
      sessionResponseSchema,
      {
        method: "POST",
        signal: controller.signal,
      },
    ).then(
      (session) => {
        setTripId(session.tripId);
        dispatch({ type: "loaded", session });
      },
      (error: unknown) => {
        if (!controller.signal.aborted) {
          dispatch({ type: "failed", message: messageOf(error, FAILED) });
        }
      },
    );
    return () => {
      controller.abort();
    };
  }, [start, dispatch, setTripId]);
}

// While a turn is still running, asks every few seconds whether it has ended, without
// marking a resume.
function useCheckRunningTurn(
  turnRunning: boolean,
  sessionId: string | null,
  dispatch: Dispatch<ChatAction>,
): void {
  useEffect(() => {
    if (!turnRunning || sessionId === null) {
      return undefined;
    }
    const controller = new AbortController();
    const timer = setInterval(() => {
      void callApi(`/api/sessions/${sessionId}`, sessionResponseSchema, {
        signal: controller.signal,
      }).then(
        (session) => {
          dispatch({ type: "loaded", session });
        },
        // Asked again on the next tick.
        () => undefined,
      );
    }, CHECK_AGAIN_MS);
    return () => {
      clearInterval(timer);
      controller.abort();
    };
  }, [turnRunning, sessionId, dispatch]);
}

function pathFor(start: ChatStart, sessionId: string | null): string {
  if (sessionId !== null) {
    return `/api/sessions/${sessionId}/messages`;
  }
  return start.page === "newSession"
    ? `/api/trips/${start.tripId}/sessions`
    : "/api/trips";
}

const FAILED = "Something went wrong. Reload the page to try again.";

// A refusal's own message, or the fallback for a failed connection.
function messageOf(error: unknown, fallback: string): string {
  return error instanceof ApiError ? error.message : fallback;
}
