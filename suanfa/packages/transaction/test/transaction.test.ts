import { describe, expect, it } from "vitest";

import {
  CallbackCommand,
  TransactionManager
} from "../src/index.js";

describe("TransactionManager", () => {
  it("rolls back commands in reverse order", () => {
    const manager = new TransactionManager();
    const values: number[] = [];

    values.push(1);
    manager.record(() => values.pop());
    values.push(2);
    manager.record(() => values.pop());

    manager.rollback();

    expect(values).toEqual([]);
    expect(manager.isEmpty).toBe(true);
  });

  it("allows an inner commit to remain reversible by its parent", () => {
    const manager = new TransactionManager();
    let total = 0;
    const outer = manager.begin();

    total += 10;
    manager.record(() => {
      total -= 10;
    });

    const inner = manager.begin();
    total += 5;
    manager.record(() => {
      total -= 5;
    });

    manager.commit(inner);
    expect(total).toBe(15);
    manager.rollback(outer);

    expect(total).toBe(0);
  });

  it("commits command actions once", () => {
    const manager = new TransactionManager();
    let commits = 0;
    manager.add(
      new CallbackCommand(
        () => undefined,
        () => {
          commits += 1;
        }
      )
    );

    manager.commit();
    manager.commit();

    expect(commits).toBe(1);
  });
});
