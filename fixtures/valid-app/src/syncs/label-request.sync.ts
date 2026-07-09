// @ts-nocheck — DSL patterns reference concept namespaces, not class instances

import Labeling from "../concepts/Labeling/LabelingConcept.ts";
import Requesting from "../concepts/Requesting/RequestingConcept.ts";
import type { Vars } from "@mit-sdg/sync-engine/engine";
import { act, sync, when } from "@mit-sdg/sync-engine/engine";

export const labelRequestSync = sync(({ item, user, text }: Vars) =>
  when(Requesting.createLabelRequested, { item, user, text }, {}).then(act(Labeling.addLabel, { item, user, text }))
);
