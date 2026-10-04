/**
 * SchedulerWorker.ts
 *
 * Web Worker implementing Chris Wilson's lookahead scheduler.
 * Runs entirely off the main thread. Uses setInterval to emit
 * { type: 'tick' } messages at a fixed 25 ms cadence so the
 * main-thread audio engine can schedule Web Audio nodes ahead
 * of the audio clock without drift.
 *
 * Incoming message shapes:
 *   { type: 'start',       bpm: number, lookahead: number }
 *   { type: 'stop' }
 *   { type: 'setBpm',      bpm: number }
 *   { type: 'setLookahead', ms: number }
 *
 * Outgoing message shapes:
 *   { type: 'tick' }
 */

// ---------------------------------------------------------------------------
// Message types
// ---------------------------------------------------------------------------

interface StartMessage {
  type: 'start';
  bpm: number;
  lookahead: number;
}

interface StopMessage {
  type: 'stop';
}

interface SetBpmMessage {
  type: 'setBpm';
  bpm: number;
}

interface SetLookaheadMessage {
  type: 'setLookahead';
  ms: number;
}

type IncomingMessage =
  | StartMessage
  | StopMessage
  | SetBpmMessage
  | SetLookaheadMessage;

interface TickMessage {
  type: 'tick';
}

// ---------------------------------------------------------------------------
// Worker state
// ---------------------------------------------------------------------------

/** Current BPM — kept in the worker so it can be updated without restarting. */
let currentBpm: number = 120;

/**
 * Lookahead window in milliseconds.
 * The main thread will schedule all beats that fall within
 * [audioContext.currentTime, audioContext.currentTime + lookaheadSec].
 * This value is informational for the worker; the tick interval is fixed.
 */
let lookaheadMs: number = 100;

/** The setInterval handle, or null when stopped. */
let intervalId: ReturnType<typeof setInterval> | null = null;

/**
 * Fixed tick interval in milliseconds.
 * 25 ms gives the main thread plenty of time to schedule ahead
 * without burning CPU.
 */
const TICK_INTERVAL_MS = 25;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Post a tick message to the main thread. */
function sendTick(): void {
  const msg: TickMessage = { type: 'tick' };
  self.postMessage(msg);
}

/** Start the interval loop. */
function startInterval(): void {
  if (intervalId !== null) {
    // Already running — clear first so we don't double-schedule.
    clearInterval(intervalId);
  }
  intervalId = setInterval(sendTick, TICK_INTERVAL_MS);
}

/** Stop the interval loop. */
function stopInterval(): void {
  if (intervalId !== null) {
    clearInterval(intervalId);
    intervalId = null;
  }
}

// ---------------------------------------------------------------------------
// Message handler
// ---------------------------------------------------------------------------

self.onmessage = (event: MessageEvent<IncomingMessage>): void => {
  const data = event.data;

  switch (data.type) {
    case 'start': {
      currentBpm = data.bpm;
      lookaheadMs = data.lookahead;
      startInterval();
      break;
    }

    case 'stop': {
      stopInterval();
      break;
    }

    case 'setBpm': {
      currentBpm = data.bpm;
      // No need to restart the interval; BPM is consumed by the main thread.
      break;
    }

    case 'setLookahead': {
      lookaheadMs = data.ms;
      // Lookahead changes are informational; the tick rate is constant.
      break;
    }

    default: {
      // Exhaustive check — TypeScript will warn if a case is missed.
      const _exhaustive: never = data;
      console.warn('[SchedulerWorker] Unknown message type:', _exhaustive);
    }
  }
};

// Silence the TypeScript "isolatedModules" warning — workers are not modules
// by default, but Vite's ?worker import wraps them correctly.
export {};
