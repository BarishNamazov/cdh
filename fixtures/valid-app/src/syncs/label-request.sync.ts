// @ts-nocheck — DSL patterns reference concept namespaces, not class instances
import { sync, when, act } from "../engine-stub/engine.ts";
import type { Vars } from "../engine-stub/engine.ts";
import Requesting from "../concepts/Requesting/RequestingConcept.ts";
import Labeling from "../concepts/Labeling/LabelingConcept.ts";

export const labelRequestSync = sync(({ item, user, text }: Vars) =>
  when(Requesting.createLabelRequested, { item, user, text }, {}).then(
    act(Labeling.addLabel, { item, user, text }),
  ),
);
