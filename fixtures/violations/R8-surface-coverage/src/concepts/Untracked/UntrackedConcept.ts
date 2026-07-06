export default class UntrackedConcept {
  add(input: { value: string }): { value: string } {
    return { value: input.value };
  }

  _getValues(): string[] {
    return [];
  }
}
