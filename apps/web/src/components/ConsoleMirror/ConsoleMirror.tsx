import { Icon } from "@/components/icon";

export type ConsoleMessageType = "log" | "warn" | "error";
export type ConsoleMessage = {
  type: ConsoleMessageType;
  message: string;
  id: string;
};

function ConsoleMirror() {
  return (
    <div className="f">
      <div>
        <span>
          <Icon icon="mdi:chevron-down" className="text-xl" />
        </span>
        <span>Console</span>
      </div>
      <div>Any console messages will be mirrored here</div>
    </div>
  );
}

export default ConsoleMirror;
