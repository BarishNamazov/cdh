import * as Audit from "../concepts/Audit.ts";
import * as Labeling from "../concepts/Labeling.ts";
import type { Vars } from "@mit-sdg/sync-engine";
import { act, on, onError, sync, when } from "@mit-sdg/sync-engine";

export const AuditLabelCreate = sync(({ labelId, error }: Vars) =>
  when(Labeling.addLabel, { item: "" }, { id: labelId })
    .where((frames) => frames.query(Audit._getEvents, { targetId: labelId }, { event: "" }))
    .then(
      act(Audit.record, {
        id: labelId,
        event: "LABEL_CREATED",
        targetId: labelId,
      }).branch(
        on(act(Audit.record, { id: labelId, event: "AUDIT_CONFIRMED", targetId: labelId })),
        onError({ error }, act(Audit.record, { id: labelId, event: "AUDIT_FAILED", error }))
      )
    )
);
