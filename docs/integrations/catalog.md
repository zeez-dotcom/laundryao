# Integration Marketplace

The integration marketplace exposes OAuth-enabled connectors for accounting, marketing automation, and messaging platforms. The
catalog is rendered in the admin client at `/automation/integrations` and backed by the workflow orchestration engine.

## Connector Metadata

Each listing surfaces the following metadata:

- **Category** – `accounting`, `marketing-automation`, or `messaging`.
- **Summary** – human readable value proposition used throughout the catalog and workflow builder picker.
- **Features** – bullet list rendered as badges on the grid view.
- **OAuth scopes** – presented to admins before authorisation and stored on the connector record.
- **Webhook events** – events exposed by the connector’s webhook registry.
- **Availability** – `GA` or `Beta`. Beta connectors require support approval before enabling in production tenants.
- **Pricing** – either `Included`, `Growth plan`, `Add-on`, or `Usage based`.
- **Setup time** – friendly string shown in the UI to guide admins on the expected configuration effort.

## Accounting Connectors

| Connector | Key capabilities | Default webhook events |
|-----------|------------------|------------------------|
| Xero | Journal/invoice sync, detergent category mapping, payout reconciliation | `invoices.created`, `payments.applied` |
| QuickBooks Online | Daily payout summary, multi-branch class tracking, automatic expense categorisation | `salesreceipt.create`, `payment.create` |

## Marketing Automation Connectors

| Connector | Key capabilities | Default webhook events |
|-----------|------------------|------------------------|
| HubSpot Journeys | Lifecycle nurture flows, loyalty triggers, personalised coupons | `contact.created`, `workflow.completed` |
| Klaviyo Campaigns | SMS and email automations, coupon redemption, audience suppression | `message.delivered`, `profile.updated` |

## Messaging Connectors

| Connector | Key capabilities | Default webhook events |
|-----------|------------------|------------------------|
| Twilio Messaging | Two-way SMS/WhatsApp conversations, driver ETA alerts | `message.received`, `message.failed` |
| Meta Messenger | Pickup confirmations, interactive receipts, customer service escalations | `message`, `messaging_postbacks` |

## Workflow Builder Integration

The workflow builder consumes the catalog via `GET /api/workflows/catalog`. Dragging an integration action onto the canvas embeds
its metadata into the workflow node configuration. Simulation mode is available for actions marked with the **Sim** badge and
invokes the backend workflow engine’s `/api/workflows/:id/simulate` endpoint.

## Deployment Checklist

1. Ensure OAuth credentials for each connector are stored in the secure configuration store.
2. Register webhook callback URLs in the third-party platforms pointing to `/api/integrations/webhooks/:provider` (future endpoint).
3. Run `npm run db:migrate` after pulling new migrations so the workflow persistence tables exist.
4. Validate workflows with `POST /api/workflows/:id/validate` before enabling them in production.
5. Update branch-level role mappings so only admins can access `/automation/workflows` and `/automation/integrations`.
