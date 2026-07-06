export default class RankedConcept {
  reorder(input: { id: string; position: number }): { id: string } {
    return { id: input.id };
  }

  _getRankings(): string[] {
    return [];
  }
}
