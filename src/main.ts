import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { randomUUID } from 'crypto';
import { ErrorRequestHandler, json, urlencoded } from 'express';
import { AppModule } from './app.module';

interface BodyParserError extends Error {
  status?: number;
  type?: string;
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  const config = app.get(ConfigService);

  app.getHttpAdapter().getInstance().disable('x-powered-by');
  const bodyLimit = config.get<string>('BODY_LIMIT') ?? '1mb';
  app.use(json({ limit: bodyLimit }));
  app.use(urlencoded({ extended: true, limit: bodyLimit }));
  app.use(bodyParserErrorHandler);
  const corsOrigins = config
    .get<string>('CORS_ORIGINS')
    ?.split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  app.enableCors(
    corsOrigins?.length
      ? {
          origin: corsOrigins,
          credentials: true,
        }
      : undefined,
  );
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidUnknownValues: false,
    }),
  );

  const documentConfig = new DocumentBuilder()
    .setTitle('OpenMole Backend')
    .setDescription('Multi-tenant AI SaaS admin and runtime backend API')
    .setVersion('0.1.0-alpha.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, documentConfig);
  SwaggerModule.setup('/docs', app, document);

  const port = config.get<number>('PORT') ?? 3000;
  await app.listen(port);
}

const bodyParserErrorHandler: ErrorRequestHandler = (
  error: BodyParserError,
  request,
  response,
  next,
) => {
  if (!error) {
    next();
    return;
  }

  const status = error.status === 413 ? 413 : 400;
  const incomingRequestId =
    request.headers['x-request-id'] ?? request.headers['x-correlation-id'];
  const requestId =
    (Array.isArray(incomingRequestId) ? incomingRequestId[0] : incomingRequestId) ??
    randomUUID();
  setBaselineSecurityHeaders(response);
  response.setHeader('x-request-id', requestId);
  response.status(status).json({
    requestId,
    code: status === 413 ? 'PAYLOAD_TOO_LARGE' : 'INVALID_REQUEST_BODY',
    message: status === 413 ? 'Request payload too large' : 'Invalid request body',
    details: status === 413 ? { limit: 'BODY_LIMIT' } : undefined,
    statusCode: status,
    timestamp: new Date().toISOString(),
    path: request.originalUrl ?? request.url,
  });
};

function setBaselineSecurityHeaders(response: Parameters<ErrorRequestHandler>[2]) {
  response.setHeader('x-content-type-options', 'nosniff');
  response.setHeader('x-frame-options', 'DENY');
  response.setHeader('referrer-policy', 'no-referrer');
  response.setHeader('cross-origin-opener-policy', 'same-origin');
  response.setHeader('permissions-policy', 'camera=(), microphone=(), geolocation=()');
}

bootstrap();
