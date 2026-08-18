export interface TransactionCommand {
  commit(): void;
  rollback(): void;
}

export class CallbackCommand implements TransactionCommand {
  private settled = false;

  public constructor(
    private readonly rollbackAction: () => void,
    private readonly commitAction: () => void = () => undefined
  ) {}

  public commit(): void {
    if (this.settled) {
      return;
    }
    this.commitAction();
    this.settled = true;
  }

  public rollback(): void {
    if (this.settled) {
      return;
    }
    this.rollbackAction();
    this.settled = true;
  }
}

export class Bookmark {
  public readonly commands: TransactionCommand[] = [];
  public active = true;

  public constructor(
    public readonly id: number,
    public readonly parent: Bookmark | undefined
  ) {}
}

export class TransactionManager {
  private nextId = 1;
  private readonly root = new Bookmark(0, undefined);
  private current = this.root;

  public begin(): Bookmark {
    this.assertActive(this.current);
    const bookmark = new Bookmark(this.nextId, this.current);
    this.nextId += 1;
    this.current = bookmark;
    return bookmark;
  }

  public add(command: TransactionCommand): void {
    this.assertActive(this.current);
    this.current.commands.push(command);
  }

  public record(rollbackAction: () => void, commitAction?: () => void): void {
    this.add(new CallbackCommand(rollbackAction, commitAction));
  }

  public commit(bookmark?: Bookmark): void {
    if (bookmark) {
      this.commitBookmark(bookmark);
      return;
    }

    if (this.current !== this.root) {
      throw new Error("All nested bookmarks must be committed before root commit");
    }
    this.finalize(this.root, "commit");
  }

  public rollback(bookmark?: Bookmark): void {
    if (bookmark) {
      this.rollbackBookmark(bookmark);
      return;
    }

    while (this.current !== this.root) {
      this.rollbackBookmark(this.current);
    }
    this.finalize(this.root, "rollback");
  }

  public get activeBookmark(): Bookmark {
    return this.current;
  }

  public get isEmpty(): boolean {
    return this.root.commands.length === 0 && this.current === this.root;
  }

  private commitBookmark(bookmark: Bookmark): void {
    this.assertCurrent(bookmark);
    const parent = bookmark.parent;
    if (!parent) {
      throw new Error("The root bookmark must be finalized with commit()");
    }
    parent.commands.push(...bookmark.commands);
    bookmark.commands.length = 0;
    bookmark.active = false;
    this.current = parent;
  }

  private rollbackBookmark(bookmark: Bookmark): void {
    this.assertCurrent(bookmark);
    this.finalize(bookmark, "rollback");
    bookmark.active = false;
    this.current = bookmark.parent ?? this.root;
  }

  private finalize(
    bookmark: Bookmark,
    action: "commit" | "rollback"
  ): void {
    const commands =
      action === "rollback" ? bookmark.commands.toReversed() : bookmark.commands;
    for (const command of commands) {
      command[action]();
    }
    bookmark.commands.length = 0;
  }

  private assertCurrent(bookmark: Bookmark): void {
    this.assertActive(bookmark);
    if (bookmark !== this.current) {
      throw new Error("Bookmarks must be finalized in LIFO order");
    }
  }

  private assertActive(bookmark: Bookmark): void {
    if (!bookmark.active) {
      throw new Error("Bookmark is no longer active");
    }
  }
}
