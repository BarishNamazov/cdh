export type PiContext = unknown;

export interface PiProbeResult {
  primitive: string;
  status: "pending" | "confirmed" | "unsupported";
  note: string;
}

export const PI_API_SPIKE_REQUIRED = true;
