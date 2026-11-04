"use client";

import { useEffect } from "react";

const API_KEY = process.env.NEXT_PUBLIC_ATLAS_API_KEY;
const API_URL = "/api/events";

function getSessionId(): string {
  let sessionId = sessionStorage.getItem("atlas_session_id");

  if (!sessionId) {
    sessionId = crypto.randomUUID();
    sessionStorage.setItem("atlas_session_id", sessionId);
  }

  return sessionId;
}

function getDevice(): string {
  const userAgent = navigator.userAgent;

  if (/tablet|ipad/i.test(userAgent)) {
    return "tablet";
  }

  if (/mobile|android|iphone/i.test(userAgent)) {
    return "mobile";
  }

  return "desktop";
}

function getBrowser(): string {
  const userAgent = navigator.userAgent;

  if (/Edg\//i.test(userAgent)) return "Edge";
  if (/OPR\//i.test(userAgent)) return "Opera";
  if (/Chrome\//i.test(userAgent)) return "Chrome";
  if (/Firefox\//i.test(userAgent)) return "Firefox";
  if (/Safari\//i.test(userAgent)) return "Safari";

  return "Other";
}

type EventPayload = {
  eventName: string;
  userId: string | null;
  sessionId: string;
  properties: Record<string, unknown>;
  pageUrl: string;
  device: string;
  browser: string;
};

export default function AtlasTracker() {
  useEffect(() => {
    if (!API_KEY) {
      console.warn(
        "Atlas Tracker: NEXT_PUBLIC_ATLAS_API_KEY is not configured."
      );
      return;
    }

    const sessionId = getSessionId();

    const pageUrl = window.location.href;

    const startTime = Date.now();

    let pageExitSent = false;

    const sendEvent = async (
      eventName: string,
      properties: Record<string, unknown> = {}
    ) => {
      const payload: EventPayload = {
        eventName,
        userId: null,
        sessionId,
        properties,
        pageUrl,
        device: getDevice(),
        browser: getBrowser(),
      };

      try {
        const response = await fetch(API_URL, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
          keepalive: true,
        });

        if (!response.ok) {
          console.error(
            `Atlas Tracker: Failed to send ${eventName}`,
            response.status
          );
        }
      } catch (error) {
        console.error(
          `Atlas Tracker: Error sending ${eventName}`,
          error
        );
      }
    };

    // Send page view event.
    void sendEvent("page_view");

    const sendPageExit = () => {
      if (pageExitSent) return;

      pageExitSent = true;

      const durationSeconds = Math.max(
        0,
        Math.round((Date.now() - startTime) / 1000)
      );

      const payload: EventPayload = {
        eventName: "page_exit",
        userId: null,
        sessionId,
        properties: {
          durationSeconds,
        },
        pageUrl,
        device: getDevice(),
        browser: getBrowser(),
      };

      const body = JSON.stringify(payload);

      // sendBeacon is designed for sending data when a page is closing.
      const blob = new Blob([body], {
        type: "application/json",
      });

      const sent = navigator.sendBeacon(
        `${API_URL}?apiKey=${encodeURIComponent(API_KEY)}`,
        blob
      );

      // Fallback if sendBeacon fails.
      if (!sent) {
        void fetch(API_URL, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${API_KEY}`,
            "Content-Type": "application/json",
          },
          body,
          keepalive: true,
        }).catch((error) => {
          console.error("Atlas Tracker: page_exit failed", error);
        });
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        sendPageExit();
      }
    };

    document.addEventListener(
      "visibilitychange",
      handleVisibilityChange
    );

    window.addEventListener("pagehide", sendPageExit);

    return () => {
      document.removeEventListener(
        "visibilitychange",
        handleVisibilityChange
      );

      window.removeEventListener("pagehide", sendPageExit);

      sendPageExit();
    };
  }, []);

  return null;
}