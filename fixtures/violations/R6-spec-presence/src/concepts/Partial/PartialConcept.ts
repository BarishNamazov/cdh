export default class PartialConcept {
  add(input: { value: string }): { value: string } {
    return { value: input.value };
  }

  _getValues(): string[] {
    return [];
  }
}
