export interface GreetingRecord {
  name: string;
  message: string;
  at: string;
}

export interface GreetingState {
  history: GreetingRecord[];
}

export default class GreetingConcept {
  constructor(private readonly state: GreetingState = { history: [] }) {}

  greet(input: { name: string }): { message: string } {
    const name = input.name.trim();
    if (!name) {
      return { error: "name is required" } as unknown as { message: string };
    }

    const message = `Hello, ${name}!`;
    this.state.history.push({ name, message, at: new Date().toISOString() });
    return { message };
  }

  ungreet(input: { name: string }): { removed: boolean } {
    const index = this.state.history.findIndex((r) => r.name === input.name);
    if (index === -1) {
      return { removed: false };
    }
    this.state.history.splice(index, 1);
    return { removed: true };
  }

  _getHistory(): GreetingRecord[] {
    return [...this.state.history];
  }
}
