export class Sequence {
  private value = 0;

  public next(): number {
    this.value += 1;
    return this.value;
  }

  public peek(): number {
    return this.value;
  }
}
