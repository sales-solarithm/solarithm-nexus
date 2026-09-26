'use client';

import { useEffect, useRef, useCallback } from 'react';

/** Strictly 10 minutes = 600,000 milliseconds */
export const INACTIVITY_TIMEOUT_MS = 10 * 60 * 1000;

/** Throttle event handler to prevent CPU overhead (1,000ms) */
export const ACTIVITY_THROTTLE_MS = 1000;

export interface UseIdleTimerOptions {
  /** Inactivity timeout duration in milliseconds. Defaults to 600,000ms (10 minutes) */
  timeoutMs?: number;
  /** Activity throttling interval in milliseconds. Defaults to 1,000ms */
  throttleMs?: number;
  /** Callback fired when user is idle for timeoutMs */
  onIdle: () => void;
  /** Whether the idle timer is actively monitoring. Defaults to true */
  enabled?: boolean;
}

export function useIdleTimer({
  timeoutMs = INACTIVITY_TIMEOUT_MS,
  throttleMs = ACTIVITY_THROTTLE_MS,
  onIdle,
  enabled = true,
}: UseIdleTimerOptions) {
  const lastActivityRef = useRef<number>(0);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const onIdleRef = useRef(onIdle);

  // Keep callback reference updated without triggering effect restarts
  useEffect(() => {
    onIdleRef.current = onIdle;
  }, [onIdle]);

  // Programmatic timer reset helper
  const resetTimer = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }

    if (!enabled) return;

    lastActivityRef.current = Date.now();
    timeoutRef.current = setTimeout(() => {
      onIdleRef.current();
    }, timeoutMs);
  }, [enabled, timeoutMs]);

  useEffect(() => {
    if (!enabled) {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      return;
    }

    // Set initial timeout on mount / when enabled
    lastActivityRef.current = Date.now();
    timeoutRef.current = setTimeout(() => {
      onIdleRef.current();
    }, timeoutMs);

    // Throttled event listener: ignores rapid consecutive events within throttleMs
    const handleActivity = () => {
      const now = Date.now();
      if (now - lastActivityRef.current < throttleMs) {
        return;
      }
      lastActivityRef.current = now;

      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      timeoutRef.current = setTimeout(() => {
        onIdleRef.current();
      }, timeoutMs);
    };

    // Check expiry on tab visibility or focus change (e.g. computer sleep or background tab)
    const checkExpiry = () => {
      if (Date.now() - lastActivityRef.current >= timeoutMs) {
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
          timeoutRef.current = null;
        }
        onIdleRef.current();
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        checkExpiry();
      }
    };

    // Interaction events specified: mousemove, mousedown, click, keydown, scroll, touchstart
    const userEvents: Array<keyof WindowEventMap> = [
      'mousemove',
      'mousedown',
      'click',
      'keydown',
      'scroll',
      'touchstart',
      'focus'
    ];

    userEvents.forEach((eventName) => {
      window.addEventListener(eventName, handleActivity, {
        passive: true,
        capture: eventName === 'scroll' // capture scroll on inner elements
      });
    });

    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Backup heartbeat check every 15 seconds to ensure accuracy even if browser throttles timeouts
    const heartbeatInterval = setInterval(checkExpiry, 15000);

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      clearInterval(heartbeatInterval);

      userEvents.forEach((eventName) => {
        window.removeEventListener(eventName, handleActivity, {
          capture: eventName === 'scroll'
        } as EventListenerOptions);
      });

      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [enabled, timeoutMs, throttleMs]);

  return { resetTimer };
}
