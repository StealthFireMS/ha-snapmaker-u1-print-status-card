export const PREFIX_NAME = "snapmaker-u1";
export const INTEGRATION_DOMAIN = "moonraker";

// Print job states as reported by the "Current Print State" sensor (Klipper print_stats.state).
export const PRINT_STATES = {
  STANDBY: "standby",
  PRINTING: "printing",
  PAUSED: "paused",
  COMPLETE: "complete",
  CANCELLED: "cancelled",
  ERROR: "error",
};

// Number of tool stations on the U1 toolchanger.
export const TOOL_COUNT = 4;
