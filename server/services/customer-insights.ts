import logger from "../logger";
import { db } from "../db";
import { sql } from "drizzle-orm";

export type CustomerInsightSentiment = "positive" | "neutral" | "negative";

export interface CustomerInsightLLMInput {
  customer: {
    id: string;
    name: string;
    branchId?: string | null;
    totalSpend: number;
    loyaltyPoints: number;
    balanceDue: number;
    orderCount: number;
    lastOrderDate: string | null;
  };
  orderCadenceDays: number | null;
  orderTimestamps: string[];
  topServices: string[];
  timelineSummary: string[];
}

export interface CustomerInsightLLMOutput {
  summary: string;
  purchaseFrequency: string;
  preferredServices: string[];
  sentiment: CustomerInsightSentiment;
}

export interface CustomerInsightsProvider {
  generate(input: CustomerInsightLLMInput): Promise<CustomerInsightLLMOutput>;
}

interface CustomerInsightsServiceOptions {
  provider?: CustomerInsightsProvider;
  ttlMs?: number;
}

export interface CustomerInsightSummaryRecord {
  customerId: string;
  summary: string;
  purchaseFrequency: string;
  preferredServices: string[];
  sentiment: CustomerInsightSentiment;
  generatedAt: Date;
}

const DEFAULT_TTL_MS = 1000 * 60 * 60 * 12; // refresh every 12 hours by default

const FALLBACK_FREQUENCY_LABELS: [number, string][] = [
  [5, "Several times per week"],
  [10, "Weekly"],
  [17, "Bi-weekly"],
  [35, "Monthly"],
];

class HeuristicInsightsProvider implements CustomerInsightsProvider {
  async generate(input: CustomerInsightLLMInput): Promise<CustomerInsightLLMOutput> {
    const { customer, orderCadenceDays, topServices, timelineSummary } = input;
    const cadenceLabel =
      orderCadenceDays == null
        ? customer.orderCount > 0
          ? "Irregular"
          : "No recent activity"
        : FALLBACK_FREQUENCY_LABELS.find(([days]) => orderCadenceDays <= days)?.[1] || "Infrequent";

    const sentimentScore = timelineSummary.reduce((score, entry) => {
      const normalized = entry.toLowerCase();
      if (normalized.includes("complaint") || normalized.includes("refund")) {
        return score - 1;
      }
      if (normalized.includes("thank") || normalized.includes("tip")) {
        return score + 1;
      }
      return score;
    }, 0);

    const sentiment: CustomerInsightSentiment = sentimentScore > 0 ? "positive" : sentimentScore < 0 ? "negative" : "neutral";

    const summaryParts = [
      `${customer.name} has placed ${customer.orderCount} order${customer.orderCount === 1 ? "" : "s"}`,
      orderCadenceDays != null
        ? `with a typical cadence of every ${Math.round(orderCadenceDays)} day${orderCadenceDays > 1 ? "s" : ""}`
        : `with ${cadenceLabel.toLowerCase()} frequency`,
      `spending approximately E£ ${customer.totalSpend.toFixed(2)} overall`,
    ];

    if (customer.lastOrderDate) {
      summaryParts.push(`last ordering on ${new Date(customer.lastOrderDate).toLocaleDateString()}`);
    }

    if (topServices.length) {
      summaryParts.push(`preferring services such as ${topServices.slice(0, 3).join(", ")}`);
    }

    if (customer.balanceDue > 0) {
      summaryParts.push(`and carrying an outstanding balance of E£ ${customer.balanceDue.toFixed(2)}`);
    }

    const summary = `${summaryParts.join(", ")}. Overall sentiment appears ${sentiment}.`;

    return {
      summary,
      purchaseFrequency: cadenceLabel,
      preferredServices: topServices.slice(0, 3),
      sentiment,
    };
  }
}

function resolveProvider(): CustomerInsightsProvider {
  const configured = process.env.CUSTOMER_INSIGHTS_PROVIDER?.toLowerCase();
  if (configured === "heuristic" || !configured) {
    return new HeuristicInsightsProvider();
  }

  if (configured === "openai") {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      logger.warn("OPENAI_API_KEY missing; falling back to heuristic insights provider");
      return new HeuristicInsightsProvider();
    }

    const model = process.env.CUSTOMER_INSIGHTS_MODEL || "gpt-4o-mini";

    return {
      async generate(input: CustomerInsightLLMInput): Promise<CustomerInsightLLMOutput> {
        const response = await fetch("https://api.openai.com/v1/responses", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model,
            input: [
              "You are a laundry operations analyst. Summarize the customer profile as JSON.",
              "Fields: summary, purchaseFrequency, preferredServices (array), sentiment (positive|neutral|negative).",
              "Use the provided context strictly.",
              { input },
            ],
            response_format: { type: "json_schema", json_schema: {
              name: "customer_insight_summary",
              schema: {
                type: "object",
                properties: {
                  summary: { type: "string" },
                  purchaseFrequency: { type: "string" },
                  preferredServices: { type: "array", items: { type: "string" } },
                  sentiment: { type: "string", enum: ["positive", "neutral", "negative"] },
                },
                required: ["summary", "purchaseFrequency", "preferredServices", "sentiment"],
                additionalProperties: false,
              },
            } },
          }),
        });

        if (!response.ok) {
          const errText = await response.text();
          throw new Error(`LLM request failed: ${response.status} ${errText}`);
        }

        const payload = (await response.json()) as any;
        const jsonText = payload?.output?.[0]?.content?.[0]?.text;
        if (!jsonText) {
          throw new Error("Unexpected LLM response payload");
        }
        const parsed = JSON.parse(jsonText) as CustomerInsightLLMOutput;
        return parsed;
      },
    } satisfies CustomerInsightsProvider;
  }

  logger.warn({ provider: configured }, "Unsupported CUSTOMER_INSIGHTS_PROVIDER value; using heuristic fallback");
  return new HeuristicInsightsProvider();
}

export class CustomerInsightsService {
  private provider: CustomerInsightsProvider;
  private ttlMs: number;
  private tableEnsured = false;

  constructor(options: CustomerInsightsServiceOptions = {}) {
    this.provider = options.provider ?? resolveProvider();
    this.ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
  }

  private async ensureTable(): Promise<void> {
    if (this.tableEnsured) return;
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS customer_insight_summaries (
        customer_id UUID PRIMARY KEY,
        summary TEXT NOT NULL,
        purchase_frequency TEXT NOT NULL,
        preferred_services JSONB NOT NULL,
        sentiment TEXT NOT NULL,
        generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    this.tableEnsured = true;
  }

  private async readSummary(customerId: string): Promise<CustomerInsightSummaryRecord | null> {
    await this.ensureTable();
    const result = await db.execute(sql`
      SELECT customer_id, summary, purchase_frequency, preferred_services, sentiment, generated_at
      FROM customer_insight_summaries
      WHERE customer_id = ${customerId}
      LIMIT 1
    `);
    const row = result.rows?.[0] as
      | {
          customer_id: string;
          summary: string;
          purchase_frequency: string;
          preferred_services: any;
          sentiment: CustomerInsightSentiment;
          generated_at: Date | string;
        }
      | undefined;
    if (!row) return null;
    return {
      customerId: row.customer_id,
      summary: row.summary,
      purchaseFrequency: row.purchase_frequency,
      preferredServices: Array.isArray(row.preferred_services)
        ? (row.preferred_services as string[])
        : typeof row.preferred_services === "string"
        ? (JSON.parse(row.preferred_services) as string[])
        : [],
      sentiment: row.sentiment,
      generatedAt: row.generated_at instanceof Date ? row.generated_at : new Date(row.generated_at),
    };
  }

  private async writeSummary(record: CustomerInsightSummaryRecord): Promise<void> {
    await this.ensureTable();
    await db.execute(sql`
      INSERT INTO customer_insight_summaries (customer_id, summary, purchase_frequency, preferred_services, sentiment, generated_at)
      VALUES (${record.customerId}, ${record.summary}, ${record.purchaseFrequency}, ${JSON.stringify(record.preferredServices)}, ${record.sentiment}, ${record.generatedAt.toISOString()})
      ON CONFLICT (customer_id) DO UPDATE
      SET summary = EXCLUDED.summary,
          purchase_frequency = EXCLUDED.purchase_frequency,
          preferred_services = EXCLUDED.preferred_services,
          sentiment = EXCLUDED.sentiment,
          generated_at = EXCLUDED.generated_at
    `);
  }

  private computeOrderCadenceDays(orderTimestamps: string[]): number | null {
    if (orderTimestamps.length < 2) return null;
    const sorted = [...orderTimestamps].sort((a, b) => new Date(a).getTime() - new Date(b).getTime());
    const gaps: number[] = [];
    for (let i = 1; i < sorted.length; i += 1) {
      const previous = new Date(sorted[i - 1]).getTime();
      const current = new Date(sorted[i]).getTime();
      const diffDays = (current - previous) / (1000 * 60 * 60 * 24);
      if (Number.isFinite(diffDays) && diffDays > 0) {
        gaps.push(diffDays);
      }
    }
    if (!gaps.length) return null;
    const avg = gaps.reduce((sum, gap) => sum + gap, 0) / gaps.length;
    return avg;
  }

  async generateSummary(input: CustomerInsightLLMInput): Promise<CustomerInsightSummaryRecord> {
    const existing = await this.readSummary(input.customer.id);
    if (existing && Date.now() - existing.generatedAt.getTime() < this.ttlMs) {
      return existing;
    }

    const cadenceDays =
      input.orderCadenceDays ?? (input.orderTimestamps.length ? this.computeOrderCadenceDays(input.orderTimestamps) : null);

    const providerInput: CustomerInsightLLMInput = {
      ...input,
      orderCadenceDays: cadenceDays,
    };

    let providerOutput: CustomerInsightLLMOutput | null = null;
    try {
      providerOutput = await this.provider.generate(providerInput);
    } catch (error) {
      logger.warn({ err: error, customerId: input.customer.id }, "LLM provider failed; using heuristic fallback");
      const fallbackProvider = new HeuristicInsightsProvider();
      providerOutput = await fallbackProvider.generate(providerInput);
    }

    const record: CustomerInsightSummaryRecord = {
      customerId: input.customer.id,
      summary: providerOutput.summary,
      purchaseFrequency: providerOutput.purchaseFrequency,
      preferredServices: providerOutput.preferredServices,
      sentiment: providerOutput.sentiment,
      generatedAt: new Date(),
    };

    await this.writeSummary(record);
    return record;
  }
}
