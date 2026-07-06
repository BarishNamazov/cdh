export default class BetaConcept {
  touch(input: { id: string }): { id: string } {
    return { id: input.id };
  }

  _getTouched(): string[] {
    return [];
  }
}
