import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { ValidationPipe, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { registerBodyParsers } from './common/http/body-parsers';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bodyParser: false });
  registerBodyParsers(app);

  // The reverse proxy on this host (nginx) appends the caller's address to
  // X-Forwarded-For. Only a loopback peer is trusted to set it, so a caller
  // connecting directly, or writing the header itself, cannot pick the address
  // that sign-in throttling and audit records use.
  app.set('trust proxy', 'loopback');

  app.setGlobalPrefix('api/v1');

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  app.useGlobalFilters(new AllExceptionsFilter());

  app.enableCors({
    origin: true,
    credentials: true,
  });

  // app.enableShutdownHooks();

  const configService = app.get(ConfigService);
  const port = configService.get<number>('PORT') || 4000;

  await app.listen(port);
  logger.log(`Server is running on http://localhost:${port}/api/v1`);
  logger.log(`Health check available at http://localhost:${port}/api/v1/health`);
}

bootstrap().catch((error) => {
  const logger = new Logger('Bootstrap');
  logger.error('Failed to start application', error);
  process.exit(1);
});
