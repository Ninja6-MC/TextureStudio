import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SPREADSHEET_ID = "1XZr7EEtqKsl29EXnO5O85gkE8D6RfX6sZb2cFG9SlTU";
const CLI_PATH = "C:\\Program Files\\nodejs\\node_modules\\@withone\\cli\\bin\\cli.js";

/**
 * Sync status & mapping directly with the official Google Sheet via One CLI
 */
export function updateSheetRows(updates = []) {
  if (updates.length === 0) return;

  const pathVars = { spreadsheetId: SPREADSHEET_ID };
  const body = {
    valueInputOption: "USER_ENTERED",
    data: updates
  };

  const args = [
    CLI_PATH,
    "--agent",
    "actions",
    "execute",
    "google-sheets",
    "conn_mod_def::GJ30k7Vqavo::zEU1ntnYTCiWrupKRe1Pig",
    "live::google-sheets::default::07c5a3b49eda40c6858e131df5de3b52",
    "--path-vars",
    JSON.stringify(pathVars),
    "-d",
    JSON.stringify(body)
  ];

  const raw = execFileSync("node", args, { encoding: "utf-8" });
  return JSON.parse(raw);
}
