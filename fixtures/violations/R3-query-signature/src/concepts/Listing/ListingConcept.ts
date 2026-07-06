export default class ListingConcept {
  publish(input: { title: string; price: number }): { id: string } {
    return { id: `list-${input.title}` };
  }

  _getListings(): { value: string } {
    return { value: "bad" };
  }
}
