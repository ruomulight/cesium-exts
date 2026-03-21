export type ConsoleMessage =
  | { type: "consoleClear" }
  | { type: "consoleLog"; log: string }
  | { type: "consoleWarn"; warn: string }
  | { type: "consoleError"; error: string; lineNumber?: number; url?: string };
