export interface LabelRecord {
  id: string;
  item: string;
  user: string;
  text: string;
}

export interface LabelingState {
  labels: LabelRecord[];
}

export default class LabelingConcept {
  constructor(private readonly state: LabelingState = { labels: [] }) {}

  addLabel(input: { item: string; user: string; text: string }): { id: string } {
    const item = input.item.trim();
    const user = input.user.trim();
    const text = input.text.trim();

    if (!item || !user || !text) {
      return { error: "item, user, and text are required" } as unknown as { id: string };
    }

    const duplicate = this.state.labels.some(
      (label) => label.item === item && label.user === user && label.text === text
    );
    if (duplicate) {
      return { error: "label already exists" } as unknown as { id: string };
    }

    const id = `label-${this.state.labels.length + 1}`;
    this.state.labels.push({ id, item, user, text });
    return { id };
  }

  removeLabel(input: { id: string }): { removed: boolean } {
    const index = this.state.labels.findIndex((label) => label.id === input.id);
    if (index === -1) {
      return { error: "label not found" } as unknown as { removed: boolean };
    }

    this.state.labels.splice(index, 1);
    return { removed: true };
  }

  _getLabels(input: { item: string }): LabelRecord[] {
    return this.state.labels.filter((label) => label.item === input.item);
  }
}
