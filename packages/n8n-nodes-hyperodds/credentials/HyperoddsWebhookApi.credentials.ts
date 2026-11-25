import type { ICredentialType, Icon, INodeProperties } from "n8n-workflow";

export class HyperoddsWebhookApi implements ICredentialType {
  name = "hyperoddsWebhookApi";

  displayName = "Hyperodds Webhook API";

  icon: Icon = { light: "file:../icons/hyperodds.svg", dark: "file:../icons/hyperodds.dark.svg" };

  documentationUrl =
    "https://github.com/usehyperodds/hyperodds-agents/tree/main/packages/n8n-nodes-hyperodds#credentials";

  properties: INodeProperties[] = [
    {
      displayName: "Signing Secret",
      name: "signingSecret",
      type: "string",
      typeOptions: { password: true },
      required: true,
      default: "",
      placeholder: "e.g. hyperodds_sig_…",
      description:
        "The secret on the Webhook card of the Alerts page at usehyperodds.com. Hyperodds signs every delivery with it, and the trigger refuses any request it did not sign.",
    },
  ];
}
