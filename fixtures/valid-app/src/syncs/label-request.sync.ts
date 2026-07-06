export interface SyncDefinition {
  name: string;
  when: string;
  then: string;
}

export const labelRequestSync: SyncDefinition = {
  name: "label-request",
  when: "Requesting.createLabelRequested",
  then: "Labeling.addLabel"
};
