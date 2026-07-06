import CategorizingConcept from "../Categorizing/CategorizingConcept.ts";

export default class TaggingConcept {
  add(input: { value: string }): { value: string } {
    new CategorizingConcept();
    return { value: input.value };
  }

  _getValues(): string[] {
    return [];
  }
}
