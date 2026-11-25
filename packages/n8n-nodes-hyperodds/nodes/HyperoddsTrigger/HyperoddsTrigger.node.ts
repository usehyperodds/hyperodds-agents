import type {
  ICredentialsDecrypted,
  ICredentialTestFunctions,
  IDataObject,
  IHookFunctions,
  INodeCredentialTestResult,
  INodeType,
  INodeTypeDescription,
  IWebhookFunctions,
  IWebhookResponseData,
} from "n8n-workflow";
import { NodeConnectionTypes } from "n8n-workflow";
import { clean } from "../Hyperodds/shape";
import { firstDelivery, parsePayload, wanted } from "./payload";
import { verify } from "./signature";

const SECRET_FORMAT = /^hyperodds_sig_[A-Za-z0-9_-]{43}$/;

const REFUSALS = {
  unset: "The trigger's signing secret is missing or malformed. Copy it again from the Alerts page",
  missing: "Missing hyperodds-signature header",
  malformed: "Malformed hyperodds-signature header",
  mismatch: "Signature does not match",
  expired: "Signature timestamp is more than 5 minutes from the receiver clock",
} as const;

export class HyperoddsTrigger implements INodeType {
  description: INodeTypeDescription = {
    displayName: "Hyperodds Trigger",
    name: "hyperoddsTrigger",
    icon: { light: "file:../../icons/hyperodds.svg", dark: "file:../../icons/hyperodds.dark.svg" },
    group: ["trigger"],
    version: 1,
    subtitle: '={{$parameter["events"].includes("*") ? "All alerts" : $parameter["events"].join(", ")}}',
    description: "Starts the workflow when one of your Hyperodds alerts fires",
    defaults: { name: "Hyperodds Trigger" },
    inputs: [],
    outputs: [NodeConnectionTypes.Main],
    credentials: [{ name: "hyperoddsWebhookApi", required: true, testedBy: "hyperoddsSigningSecretTest" }],
    webhooks: [{ name: "default", httpMethod: "POST", responseMode: "onReceived", path: "webhook" }],
    triggerPanel: {
      header: "Waiting for a Hyperodds alert",
      executionsHelp: {
        inactive:
          "Publish this workflow, then add its Production URL on the Webhook card of the Alerts page at usehyperodds.com. Hyperodds sends a signed test message when you add it, and the run appears under Executions.",
        active:
          "This workflow runs on every alert you send to the Webhook channel. Press <b>Send test</b> on the Alerts page to check it: the run appears under Executions.",
      },
      activationHint: "Publish this workflow so your Hyperodds alerts start it.",
    },
    properties: [
      {
        displayName:
          "Sign in on the Hyperodds Alerts page with your wallet, press Show next to the signing secret on the Webhook card and save it in the credential above. Then publish this workflow and add its Production URL on the same card.",
        name: "setupNotice",
        type: "notice",
        default: "",
      },
      {
        displayName: "Events",
        name: "events",
        type: "multiOptions",
        required: true,
        default: ["*"],
        options: [
          { name: "Any Alert", value: "*", description: "Every alert kind, including ones added later" },
          {
            name: "Edge",
            value: "alert.edge",
            description: "A market's edge after fees reached your threshold",
          },
          { name: "New Market", value: "alert.new_market", description: "A market was listed" },
          { name: "Rule Change", value: "alert.rule_change", description: "A market's terms changed" },
          {
            name: "Settling",
            value: "alert.settling",
            description: "A market's deadline or event time is close",
          },
          {
            name: "Volume Spike",
            value: "alert.volume_spike",
            description: "The last hour's volume jumped against the day before",
          },
        ],
        description:
          "The alert kinds that start the workflow. Other deliveries are acknowledged and dropped.",
      },
      {
        displayName: "Options",
        name: "options",
        type: "collection",
        placeholder: "Add Option",
        default: {},
        options: [
          {
            displayName: "Drop Repeated Deliveries",
            name: "dedupe",
            type: "boolean",
            default: true,
            description:
              "Whether to skip a delivery whose ID already started this workflow. Hyperodds retries a delivery it could not confirm with the same ID.",
          },
          {
            displayName: "Include Test Messages",
            name: "includeTests",
            type: "boolean",
            default: true,
            description: "Whether the test message sent from the Alerts page starts the workflow",
          },
        ],
      },
    ],
  };

  methods = {
    credentialTest: {
      async hyperoddsSigningSecretTest(
        this: ICredentialTestFunctions,
        credential: ICredentialsDecrypted,
      ): Promise<INodeCredentialTestResult> {
        const secret = String(credential.data?.signingSecret ?? "").trim();
        if (SECRET_FORMAT.test(secret)) {
          return { status: "OK", message: "The signing secret has the expected format" };
        }
        return {
          status: "Error",
          message:
            "A Hyperodds signing secret starts with hyperodds_sig_ followed by 43 letters, digits, - or _. Copy it again from the Webhook card on the Alerts page.",
        };
      },
    },
  };

  // Hyperodds has no API to register a webhook: the user pastes the URL into the Alerts page, so
  // there is nothing to create or remove on activation.
  webhookMethods = {
    default: {
      async checkExists(this: IHookFunctions): Promise<boolean> {
        return true;
      },
      async create(this: IHookFunctions): Promise<boolean> {
        return true;
      },
      async delete(this: IHookFunctions): Promise<boolean> {
        return true;
      },
    },
  };

  async webhook(this: IWebhookFunctions): Promise<IWebhookResponseData> {
    const req = this.getRequestObject();
    const res = this.getResponseObject();
    const reply = (status: number, body: IDataObject): IWebhookResponseData => {
      res.status(status).json(body);
      return { noWebhookResponse: true };
    };

    const credentials = await this.getCredentials("hyperoddsWebhookApi");
    const secret = String(credentials.signingSecret ?? "").trim();
    // Anyone could sign with an empty or mistyped secret, so nothing gets in until it is set up.
    if (!SECRET_FORMAT.test(secret)) return reply(401, { error: REFUSALS.unset });
    const header = this.getHeaderData()["hyperodds-signature"];
    const body = Buffer.isBuffer(req.rawBody) ? req.rawBody : Buffer.alloc(0);

    const verdict = verify(secret, Array.isArray(header) ? header.join(",") : header, body);
    if (!verdict.ok) return reply(401, { error: REFUSALS[verdict.reason] });

    const payload = parsePayload(body);
    if (!payload) return reply(400, { error: "The body is not a Hyperodds webhook payload" });

    const events = this.getNodeParameter("events", ["*"]) as string[];
    const options = this.getNodeParameter("options", {}) as { dedupe?: boolean; includeTests?: boolean };
    if (!wanted(payload, events, options.includeTests ?? true)) {
      return reply(200, { received: true, started: false, reason: "event not selected" });
    }
    if ((options.dedupe ?? true) && !firstDelivery(this.getWorkflowStaticData("node"), payload.id)) {
      return reply(200, { received: true, started: false, reason: "duplicate delivery" });
    }

    // Answer before the workflow runs, so a slow workflow never reads as a failed delivery and a retry.
    return {
      ...reply(200, { received: true, started: true }),
      // Deployers write market titles, and alerts quote them to chats and agents.
      workflowData: [this.helpers.returnJsonArray([clean(payload)])],
    };
  }
}
