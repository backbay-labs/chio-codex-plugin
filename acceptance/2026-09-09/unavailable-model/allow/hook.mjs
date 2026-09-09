import {readFileSync,appendFileSync} from "node:fs";
const event = JSON.parse(readFileSync(0, "utf8"));
appendFileSync(process.argv[3], JSON.stringify(event) + "\n");
const mode = process.argv[2];
if (mode === "deny") console.log(JSON.stringify({hookSpecificOutput:{hookEventName:"PreToolUse",permissionDecision:"deny",permissionDecisionReason:"designated disposable resource is forbidden"}}));
if (mode === "crash") process.exit(1);
if (mode === "malformed") console.log("{broken-json");
if (mode === "timeout") await new Promise(resolve => setTimeout(resolve, 10000));
