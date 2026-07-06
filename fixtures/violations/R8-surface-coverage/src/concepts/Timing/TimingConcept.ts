export default class TimingConcept {
  start(input: { name: string }): { id: string } {
    return { id: input.name };
  }

  _getTimers(): string[] {
    return [];
  }
}
