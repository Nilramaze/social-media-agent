import assert from "node:assert/strict";
import { test } from "node:test";
import { buildReplenishOutputSchema, buildStrategistOutputSchema } from "./schema";

const PILLARS = [{ name: "Wasserwerte", description: "Alles zu stabilen Werten" }];

test("the strategist schema rejects a format the campaign deselected", () => {
  const schema = buildStrategistOutputSchema(["carousel", "post"]);

  const result = schema.safeParse({
    pillars: PILLARS,
    briefs: [{ topic: "Nitrat senken", format: "reel", pillarName: "Wasserwerte" }],
  });

  assert.equal(result.success, false);
});

test("the strategist schema accepts the allowed formats", () => {
  const schema = buildStrategistOutputSchema(["carousel", "post"]);

  const result = schema.safeParse({
    pillars: PILLARS,
    briefs: [
      { topic: "Nitrat senken", format: "carousel", pillarName: "Wasserwerte" },
      { topic: "pH stabil halten", format: "post", pillarName: "Wasserwerte" },
    ],
  });

  assert.equal(result.success, true);
});

test("a single allowed format pins every brief to it", () => {
  const schema = buildReplenishOutputSchema(["post"]);

  assert.equal(
    schema.safeParse({ briefs: [{ topic: "T", format: "post", pillarName: "P" }] }).success,
    true,
  );
  assert.equal(
    schema.safeParse({ briefs: [{ topic: "T", format: "carousel", pillarName: "P" }] }).success,
    false,
  );
});

test("an empty format list falls back to all formats instead of rejecting everything", () => {
  const schema = buildStrategistOutputSchema([]);

  const result = schema.safeParse({
    pillars: PILLARS,
    briefs: [{ topic: "Nitrat senken", format: "reel", pillarName: "Wasserwerte" }],
  });

  assert.equal(result.success, true);
});
