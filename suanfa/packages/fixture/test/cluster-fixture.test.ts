import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  loadClusterFixture,
  verifyClusterFixture
} from "../src/index.js";

const freppleTestRoot = process.env.FREPPLE_TEST_ROOT ?? "E:/frepple-master/test";
const fixtureDirectory = resolve(freppleTestRoot, "cluster");

describe("cluster fixture compatibility", () => {
  it("matches the frePPLe level and cluster assertions", async () => {
    const graph = await loadClusterFixture(resolve(fixtureDirectory, "cluster.xml"));
    const expected = await readFile(
      resolve(fixtureDirectory, "cluster.1.expect"),
      "utf8"
    );

    expect(verifyClusterFixture(graph)).toBe(expected);
  });
});
