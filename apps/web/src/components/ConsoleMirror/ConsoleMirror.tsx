import { Icon } from "@/components/icon";

export type ConsoleMessageType = "log" | "warn" | "error";
export type ConsoleMessage = {
  type: ConsoleMessageType;
  message: string;
  id: string;
};

function ConsoleMirror() {
  return (
    <div>
      <div>
        <span>
          <Icon icon="mdi:chevron-down" className="text-xl" />
        </span>
        <span>控制台</span>
      </div>
      <div>Any console messages will be mirrored here</div>
    </div>
  );
}

export default ConsoleMirror;
