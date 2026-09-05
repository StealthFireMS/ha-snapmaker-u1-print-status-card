import { version } from "../package.json";
import "./cards/print-status-card/print-status-card";

console.info(
  `%c🖨️ Snapmaker U1 Print Status Card %c ${version}`,
  "color: #ffffff; background: #2b2b2b; padding: 5px; font-size: 1.1em;",
  "color: #ffffff; background: #039be5; font-size: 1.1em; padding: 5px"
);
