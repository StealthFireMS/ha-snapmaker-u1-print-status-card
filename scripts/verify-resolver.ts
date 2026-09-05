// Regression check for the entity-discovery resolver in src/utils/helpers.ts.
//
// Feeds it a real anonymised entity_id dump captured from a live Snapmaker U1 running Paxx
// Extended Firmware (moonraker-home-assistant), including its noisy raw gcode-macro buttons,
// and asserts every role this card actually depends on resolves to a sane entity. Run with:
//   npx ts-node --transpile-only scripts/verify-resolver.ts [path-to-entity-list.txt]
import * as fs from "fs";
import * as path from "path";
import { buildRoleCandidates, resolveRoles } from "../src/utils/helpers";

const fixturePath = process.argv[2] ?? path.join(__dirname, "fixtures/u1-entities.txt");
const entityIds = fs
  .readFileSync(fixturePath, "utf-8")
  .split("\n")
  .map((l) => l.trim())
  .filter(Boolean);

const deviceId = "u1-device";
const entities: any = {};
for (const id of entityIds) {
  entities[id] = { device_id: deviceId, platform: "moonraker" };
}
const hass = { entities };

const roleOrder = buildRoleCandidates(4);
const result = resolveRoles(hass, deviceId, roleOrder);

// Roles the card's UI actually renders - if these are missing or wrong, the card is broken.
const REQUIRED_ROLES = [
  "print_state",
  "progress",
  "filename",
  "current_layer",
  "total_layer",
  "print_time_left",
  "bed_temp",
  "bed_target",
  "cavity_temp",
  "cavity_fan_speed",
  "cavity_light",
  "pause_print",
  "resume_print",
  "cancel_print",
  "emergency_stop",
  "home_all_axes",
  "speed_factor",
  "webcam",
  "thumbnail",
  "tool0_temp",
  "tool1_temp",
  "tool2_temp",
  "tool3_temp",
  "tool0_target",
  "tool1_target",
  "tool2_target",
  "tool3_target",
  "tool0_filament",
  "tool1_filament",
  "tool2_filament",
  "tool3_filament",
];

let failed = false;
for (const role of REQUIRED_ROLES) {
  if (!result[role]) {
    failed = true;
    console.error(`MISSING required role: ${role}`);
  } else if (/(^|_)macro(_|$)/.test(result[role].entity_id)) {
    failed = true;
    console.error(`Role ${role} resolved to a raw macro entity: ${result[role].entity_id}`);
  }
}

console.log(
  `Checked ${REQUIRED_ROLES.length} required roles against ${entityIds.length} entities.`
);
if (failed) {
  console.error("\nResolver regression check FAILED.");
  process.exit(1);
}
console.log("Resolver regression check passed.");
