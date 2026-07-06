import BetaConcept from "../Beta/BetaConcept.ts";

export default class AlphaConcept {
  add(input: { value: string }): { value: string } {
    new BetaConcept();
    return { value: input.value };
  }

  _getValues(): string[] {
    return [];
  }
}
