import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { parseDate } from "../../kernel/src/index.js";
import {
  loadCalendarFixture,
  renderCalendarFixture
} from "../src/index.js";

const freppleTestRoot = process.env.FREPPLE_TEST_ROOT ?? "E:/frepple-master/test";
const fixtureDirectory = resolve(freppleTestRoot, "calendar");

describe("calendar fixture compatibility", () => {
  it("matches the frePPLe calendar fixture output", async () => {
    const calendars = await loadCalendarFixture(
      resolve(fixtureDirectory, "calendar.xml")
    );
    const expected = await readFile(
      resolve(fixtureDirectory, "calendar.1.expect"),
      "utf8"
    );

    expect(renderCalendarFixture(calendars, parseDate("2012-12-31T00:00:00"))).toBe(
      expected
    );
  });
});
