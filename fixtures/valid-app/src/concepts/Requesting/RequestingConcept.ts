export default class RequestingConcept {
  constructor(private readonly _state: Record<string, never> = {}) {}

  createLabelRequested(input: { item: string; user: string; text: string }): { requestId: string } {
    return { requestId: `req-${input.item}` };
  }
}
