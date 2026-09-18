import { describe, expect, it } from "vitest";
import { canonicalize, stripNonSemantic } from "./hashing";

describe("canonicalize", () => {
  it("sorts keys and ignores undefined", () => {
    expect(canonicalize({ b: 1, a: { d: undefined, c: 2 } })).toBe('{"a":{"c":2},"b":1}');
  });
  it("rounds floats so UI jitter does not change the hash", () => {
    expect(canonicalize({ x: 0.1000000001 })).toBe(canonicalize({ x: 0.1 }));
  });
  it("trims strings", () => {
    expect(canonicalize({ s: " a " })).toBe(canonicalize({ s: "a" }));
  });
  it("strips non-semantic keys", () => {
    expect(stripNonSemantic({ name: "x", collision: "box" })).toEqual({ collision: "box" });
  });
});
