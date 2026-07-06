export default class PrioritizingConcept {
  assign(input: { id: string; score: number }): { id: string } {
    return { id: input.id };
  }

  _getPriority(input: { id: string }): number[] {
    return [0];
  }
}
