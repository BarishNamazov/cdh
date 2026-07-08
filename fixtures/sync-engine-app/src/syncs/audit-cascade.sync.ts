import { sync, when, act, on, onError } from "../engine-stub/engine.ts";
import type { Vars } from "../engine-stub/engine.ts";
import * as Labeling from "../concepts/Labeling.ts";
import * as Audit from "../concepts/Audit.ts";

export const AuditLabelCreate = sync(({ labelId, error }: Vars) =>
  when(Labeling.addLabel, { item: "" }, { id: labelId })
    .where((frames) =>
      frames.query(
        Audit._getEvents,
        { targetId: labelId },
        { event: "" },
      ),
    )
    .then(
      act(Audit.record, {
        id: labelId,
        event: "LABEL_CREATED",
        targetId: labelId,
      }).branch(
        on(act(Audit.record, { id: labelId, event: "AUDIT_CONFIRMED", targetId: labelId })),
        onError({ error }, act(Audit.record, { id: labelId, event: "AUDIT_FAILED", error })),
      ),
    ),
);
