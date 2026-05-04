import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Webhook, WebhookDelivery } from '@prisma/client';
import { createHmac } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { ALLOWED_WEBHOOK_EVENTS } from './webhook-events';

interface DispatchWebhookInput {
  appId: string;
  tenantId?: string | null;
  eventType: string;
  payload: Record<string, unknown>;
}

@Injectable()
export class WebhookDeliveryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async dispatch(input: DispatchWebhookInput) {
    if (!ALLOWED_WEBHOOK_EVENTS.includes(input.eventType)) {
      return [];
    }

    const webhooks = await this.prisma.webhook.findMany({
      where: {
        appId: input.appId,
        status: 'active',
        events: { has: input.eventType },
        OR: [{ tenantId: input.tenantId ?? null }, { tenantId: null }],
      },
      orderBy: { createdAt: 'asc' },
    });

    const deliveries: WebhookDelivery[] = [];
    for (const webhook of webhooks) {
      const delivery = await this.prisma.webhookDelivery.create({
        data: {
          webhookId: webhook.id,
          eventType: input.eventType,
          payload: input.payload as never,
          status: 'pending',
        },
      });
      deliveries.push(await this.deliver(webhook, delivery));
    }
    return deliveries;
  }

  async retry(webhookId: string, deliveryId: string) {
    const [webhook, delivery] = await Promise.all([
      this.prisma.webhook.findUnique({ where: { id: webhookId } }),
      this.prisma.webhookDelivery.findUnique({ where: { id: deliveryId } }),
    ]);
    if (!webhook) throw new NotFoundException('Webhook not found');
    if (!delivery || delivery.webhookId !== webhookId) {
      throw new NotFoundException('Webhook delivery not found');
    }
    return this.deliver(webhook, delivery);
  }

  private async deliver(webhook: Webhook, delivery: WebhookDelivery) {
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const body = JSON.stringify({
      id: delivery.id,
      eventType: delivery.eventType,
      createdAt: delivery.createdAt,
      payload: delivery.payload,
    });
    const secret = this.resolveSecret(webhook.secretRef);
    const headers: Record<string, string> = {
      'content-type': 'application/json',
      'x-webhook-id': webhook.id,
      'x-webhook-delivery': delivery.id,
      'x-webhook-event': delivery.eventType,
      'x-webhook-timestamp': timestamp,
    };
    if (secret) {
      headers['x-webhook-signature'] = this.sign(secret, timestamp, body);
    }

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      const response = await fetch(webhook.url, {
        method: 'POST',
        headers,
        body,
        signal: controller.signal,
      });
      clearTimeout(timeout);
      const responseBody = await response.text().catch(() => '');
      return this.prisma.webhookDelivery.update({
        where: { id: delivery.id },
        data: {
          status: response.ok ? 'succeeded' : 'failed',
          attemptCount: { increment: 1 },
          responseStatus: response.status,
          responseBody: responseBody.slice(0, 4000),
          nextRetryAt: response.ok ? null : this.nextRetryAt(),
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Webhook failed';
      return this.prisma.webhookDelivery.update({
        where: { id: delivery.id },
        data: {
          status: 'failed',
          attemptCount: { increment: 1 },
          responseBody: message.slice(0, 4000),
          nextRetryAt: this.nextRetryAt(),
        },
      });
    }
  }

  private resolveSecret(secretRef?: string | null) {
    if (!secretRef) return undefined;
    const key = secretRef.startsWith('env:') ? secretRef.slice(4) : secretRef;
    return this.config.get<string>(key) ?? process.env[key];
  }

  private sign(secret: string, timestamp: string, body: string) {
    return `sha256=${createHmac('sha256', secret)
      .update(`${timestamp}.${body}`)
      .digest('hex')}`;
  }

  private nextRetryAt() {
    return new Date(Date.now() + 5 * 60 * 1000);
  }
}
