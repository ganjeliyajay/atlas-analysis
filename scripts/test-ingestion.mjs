import { randomUUID } from "node:crypto";

const endpoint = process.env.ATLAS_INGEST_URL ?? "http://localhost:3000/api/v1/events";
const apiKey = process.env.ATLAS_API_KEY;
if (!apiKey) throw new Error("Set ATLAS_API_KEY to a valid ingestion key.");

const idempotencyKey = `atlas-idempotency-test-${randomUUID()}`;
const event = {
  eventName: "phase2_idempotency_smoke_test",
  userId: `smoke-${randomUUID()}`,
  sessionId: `smoke-session-${randomUUID()}`,
  properties: { smokeTest: true },
};

async function send(payload) {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "Idempotency-Key": idempotencyKey,
    },
    body: JSON.stringify(payload),
  });
  const body = await response.json();
  return { status: response.status, body };
}

const first = await send({ events: [event] });
if (first.status !== 202 || first.body.accepted !== 1) {
  throw new Error(`First delivery failed: ${JSON.stringify(first)}`);
}

const duplicate = await send({ events: [event] });
if (duplicate.status !== 202 || duplicate.body.duplicate !== true) {
  throw new Error(`Duplicate delivery was not replayed: ${JSON.stringify(duplicate)}`);
}

const conflict = await send({
  events: [{ ...event, eventName: "different_payload_same_key" }],
});
if (conflict.status !== 409) {
  throw new Error(`Expected idempotency conflict 409: ${JSON.stringify(conflict)}`);
}

console.log(JSON.stringify({
  success: true,
  firstStatus: first.status,
  duplicateStatus: duplicate.status,
  duplicateAccepted: duplicate.body.accepted,
  conflictStatus: conflict.status,
}, null, 2));
