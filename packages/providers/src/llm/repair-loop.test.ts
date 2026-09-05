import assert from "node:assert/strict";
import { test } from "node:test";
import { runStructuredWithRepair } from "./repair-loop";

test("succeeds on the first attempt without retrying", async () => {
  let calls = 0;
  const result = await runStructuredWithRepair<{ ok: true }>(async () => {
    calls++;
    return { parsedOutput: { ok: true } };
  }, 2);

  assert.deepEqual(result, { ok: true });
  assert.equal(calls, 1);
});

test("retries after a validation failure and succeeds on a later attempt", async () => {
  let calls = 0;
  const result = await runStructuredWithRepair<{ ok: true }>(async (repairNote) => {
    calls++;
    if (calls === 1) {
      assert.equal(repairNote, undefined);
      return { parsedOutput: null, errorSummary: "missing field 'ok'" };
    }
    assert.equal(repairNote, "missing field 'ok'");
    return { parsedOutput: { ok: true } };
  }, 2);

  assert.deepEqual(result, { ok: true });
  assert.equal(calls, 2);
});

test("throws after exhausting maxRetries", async () => {
  let calls = 0;
  await assert.rejects(
    () =>
      runStructuredWithRepair<{ ok: true }>(async () => {
        calls++;
        return { parsedOutput: null, errorSummary: "still broken" };
      }, 2),
    /still broken/,
  );

  assert.equal(calls, 3);
});
