export default class SchedulingConcept {
  schedule(input: { event: string; time: string }): { id: string } {
    return { id: `sched-${input.event}` };
  }

  _getScheduled(): string[] {
    return [];
  }
}
