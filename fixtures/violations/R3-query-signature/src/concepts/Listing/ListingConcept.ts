export default class ListingConcept {
  add(input: { value: string }): { value: string } {
    return { value: input.value };
  }

  _getValues(): { value: string } {
    return { value: "bad" };
  }
}
