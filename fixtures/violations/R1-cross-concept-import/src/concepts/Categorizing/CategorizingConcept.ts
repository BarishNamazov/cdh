export default class CategorizingConcept {
  assign(input: { id: string }): { id: string } {
    return { id: input.id };
  }

  _getCategories(): string[] {
    return [];
  }
}
