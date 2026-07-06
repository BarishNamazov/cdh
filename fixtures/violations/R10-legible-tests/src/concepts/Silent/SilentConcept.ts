export default class SilentConcept {
  add(input: { value: string }): { value: string } {
    return { value: input.value };
  }

  _getValues(): string[] {
    return [];
  }
}
