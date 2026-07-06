export default class RecordingConcept {
  record(input: { data: string }): { id: string } {
    return { id: `rec-${input.data}` };
  }

  _getRecordings(): string[] {
    return [];
  }
}
