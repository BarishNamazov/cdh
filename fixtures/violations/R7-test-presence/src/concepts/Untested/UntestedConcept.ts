export default class UntestedConcept {
  add(input: { value: string }): { value: string } {
    return { value: input.value };
  }

  _getValues(): string[] {
    return [];
  }
}
