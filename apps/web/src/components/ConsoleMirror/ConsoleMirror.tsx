export type ConsoleMessageType = "log" | "warn" | "error";
export type ConsoleMessage = {
  type: ConsoleMessageType;
  message: string;
  id: string;
};

function ConsoleMirror() {
  return (
    <div>
      <div>Console</div>
      <div>Any console messages will be mirrored here</div>
    </div>
  );
}

export default ConsoleMirror;
