import { randomUUID } from "node:crypto";
import { differenceInMinutes } from "date-fns";

export type IntegrationCategory =
  | "accounting"
  | "marketing-automation"
  | "messaging";

export interface OAuthConfig {
  clientId: string;
  clientSecret: string;
  authorizationUrl: string;
  tokenUrl: string;
  scopes: string[];
  redirectUri: string;
}

export interface OAuthToken {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: Date;
  scope?: string[];
}

export interface ConnectorMetadata {
  id: string;
  name: string;
  description: string;
  category: IntegrationCategory;
  icon?: string;
  oauth?: OAuthConfig;
  capabilities: string[];
  isBeta?: boolean;
}

export interface WebhookRegistration {
  id: string;
  event: string;
  targetUrl: string;
  createdAt: Date;
  secret?: string;
}

export interface ConnectorContext {
  accountId: string;
  branchId?: string | null;
  metadata?: Record<string, unknown>;
}

export class OAuthManager {
  private readonly tokens = new Map<string, OAuthToken>();

  constructor(private readonly oauth: OAuthConfig) {}

  async exchange(code: string): Promise<OAuthToken> {
    const token: OAuthToken = {
      accessToken: `${code}-${Buffer.from(this.oauth.clientId).toString("base64")}`,
      refreshToken: randomUUID(),
      expiresAt: new Date(Date.now() + 55 * 60 * 1000),
      scope: this.oauth.scopes,
    };
    this.tokens.set(code, token);
    return token;
  }

  async refresh(token: OAuthToken): Promise<OAuthToken> {
    if (!token.refreshToken) {
      throw new Error("Refresh token missing");
    }
    const refreshed: OAuthToken = {
      accessToken: `${token.refreshToken}-${Date.now()}`,
      refreshToken: token.refreshToken,
      expiresAt: new Date(Date.now() + 55 * 60 * 1000),
      scope: token.scope ?? this.oauth.scopes,
    };
    return refreshed;
  }

  isExpired(token: OAuthToken): boolean {
    if (!token.expiresAt) return false;
    return differenceInMinutes(token.expiresAt, new Date()) <= 0;
  }
}

export class WebhookRegistry {
  private readonly hooks = new Map<string, WebhookRegistration>();

  register(event: string, targetUrl: string, secret?: string): WebhookRegistration {
    const id = randomUUID();
    const registration: WebhookRegistration = {
      id,
      event,
      targetUrl,
      secret,
      createdAt: new Date(),
    };
    this.hooks.set(id, registration);
    return registration;
  }

  list(event?: string): WebhookRegistration[] {
    const hooks = Array.from(this.hooks.values());
    return event ? hooks.filter((hook) => hook.event === event) : hooks;
  }

  remove(id: string): boolean {
    return this.hooks.delete(id);
  }
}

export abstract class ConnectorBase {
  protected readonly registry = new WebhookRegistry();
  protected tokens = new Map<string, OAuthToken>();

  constructor(
    protected readonly metadata: ConnectorMetadata,
    protected readonly oauthManager?: OAuthManager,
  ) {}

  get info(): ConnectorMetadata {
    return this.metadata;
  }

  listWebhooks(): WebhookRegistration[] {
    return this.registry.list();
  }

  async registerWebhook(event: string, targetUrl: string): Promise<WebhookRegistration> {
    return this.registry.register(event, targetUrl);
  }

  async removeWebhook(id: string): Promise<boolean> {
    return this.registry.remove(id);
  }

  async authorize(accountId: string, code: string): Promise<OAuthToken> {
    if (!this.oauthManager) {
      throw new Error(`${this.metadata.name} does not support OAuth`);
    }
    const token = await this.oauthManager.exchange(code);
    this.tokens.set(accountId, token);
    return token;
  }

  protected async getValidToken(accountId: string): Promise<OAuthToken> {
    const token = this.tokens.get(accountId);
    if (!token) {
      throw new Error(`No OAuth token for ${accountId}`);
    }
    if (this.oauthManager && this.oauthManager.isExpired(token)) {
      const refreshed = await this.oauthManager.refresh(token);
      this.tokens.set(accountId, refreshed);
      return refreshed;
    }
    return token;
  }
}

export class AccountingConnector extends ConnectorBase {
  async syncInvoices(context: ConnectorContext): Promise<{ synced: number }> {
    await this.getValidToken(context.accountId);
    const count = Math.floor(Math.random() * 5) + 1;
    return { synced: count };
  }

  async exportLedger(context: ConnectorContext): Promise<{ url: string }> {
    await this.getValidToken(context.accountId);
    return {
      url: `https://api.example.com/ledger/${context.accountId}/${Date.now()}`,
    };
  }
}

export class MarketingAutomationConnector extends ConnectorBase {
  async triggerJourney(
    context: ConnectorContext,
    journeyId: string,
    payload: Record<string, unknown>,
  ): Promise<{ status: string }> {
    await this.getValidToken(context.accountId);
    return {
      status: `Journey ${journeyId} triggered for ${context.accountId}`,
    };
  }

  async upsertProfile(
    context: ConnectorContext,
    profile: Record<string, unknown>,
  ): Promise<{ profileId: string }> {
    await this.getValidToken(context.accountId);
    return {
      profileId: profile.id ? String(profile.id) : randomUUID(),
    };
  }
}

export class MessagingConnector extends ConnectorBase {
  async sendMessage(
    context: ConnectorContext,
    channel: "sms" | "whatsapp" | "push",
    _message: string,
    _metadata: Record<string, unknown> = {},
  ): Promise<{ id: string; channel: string }> {
    await this.getValidToken(context.accountId);
    return {
      id: randomUUID(),
      channel,
    };
  }

  async registerInboundWebhook(targetUrl: string): Promise<WebhookRegistration> {
    return this.registerWebhook("message.received", targetUrl);
  }
}

export class IntegrationCatalog {
  private readonly connectors: ConnectorBase[] = [];

  constructor(connectors: ConnectorBase[]) {
    this.connectors = connectors;
  }

  list(): ConnectorMetadata[] {
    return this.connectors.map((connector) => connector.info);
  }

  findById(id: string): ConnectorBase | undefined {
    return this.connectors.find((connector) => connector.info.id === id);
  }
}
