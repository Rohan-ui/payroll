import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { Prisma } from '@prisma/client';

/**
 * Prisma error codes translated into stable, non-leaking responses.
 *
 * A raw Prisma error exposes model names, column names and query structure,
 * and reaches the user as a 500 for what is usually a bad request. Each entry
 * maps a code to the status and wording the caller should actually see.
 */
const PRISMA_ERROR_RESPONSES: Record<
  string,
  { status: HttpStatus; message: string }
> = {
  // Malformed value for the column type, such as a non-UUID in a UUID column.
  P2023: {
    status: HttpStatus.BAD_REQUEST,
    message: 'One of the supplied identifiers is not in a valid format.',
  },
  // Unique constraint violated.
  P2002: {
    status: HttpStatus.CONFLICT,
    message: 'A record with these details already exists.',
  },
  // Foreign key constraint violated: the referenced record does not exist, or
  // belongs to another tenant and is therefore invisible to this request.
  P2003: {
    status: HttpStatus.BAD_REQUEST,
    message: 'A referenced record does not exist or is not available in this workspace.',
  },
  // Required related record not found.
  P2025: {
    status: HttpStatus.NOT_FOUND,
    message: 'The requested record was not found.',
  },
  // Value too long for the column.
  P2000: {
    status: HttpStatus.BAD_REQUEST,
    message: 'One of the supplied values is too long.',
  },
  // Null constraint violated.
  P2011: {
    status: HttpStatus.BAD_REQUEST,
    message: 'A required value is missing.',
  },
  // Check constraint violated.
  P2010: {
    status: HttpStatus.BAD_REQUEST,
    message: 'The request could not be completed because a data rule was violated.',
  },
};

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'An unexpected internal error occurred';
    let errors: unknown = undefined;
    let retryAfterSeconds: number | undefined;
    // A stable machine-readable reason, for the few errors a client must act on.
    let code: string | undefined;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const res = exception.getResponse();
      if (typeof res === 'string') {
        message = res;
      } else if (typeof res === 'object' && res !== null) {
        const obj = res as Record<string, unknown>;
        message = (obj.message as string) || exception.message;
        errors = obj.errors;

        if (typeof obj.retryAfterSeconds === 'number') {
          retryAfterSeconds = obj.retryAfterSeconds;
        }
        if (typeof obj.code === 'string') {
          code = obj.code;
        }
      }
    } else if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      const mapped = PRISMA_ERROR_RESPONSES[exception.code];

      if (mapped) {
        status = mapped.status;
        message = mapped.message;
      } else {
        message = 'The request could not be completed.';
      }

      // The detail stays in the server log, where model and column names are
      // useful, and never goes to the caller.
      this.logger.error(
        `Prisma ${exception.code} on ${request.method} ${request.url}: ${exception.message.split('\n').pop()?.trim()}`,
      );
    } else if (exception instanceof Prisma.PrismaClientValidationError) {
      status = HttpStatus.BAD_REQUEST;
      message = 'The request was not valid.';
      this.logger.error(`Prisma validation error on ${request.method} ${request.url}`);
    } else {
      this.logger.error('Unhandled exception:', exception);
    }

    if (retryAfterSeconds !== undefined) {
      // Standard header so clients and proxies can back off correctly.
      response.setHeader('Retry-After', String(retryAfterSeconds));
    }

    response.status(status).json({
      statusCode: status,
      timestamp: new Date().toISOString(),
      path: request.url,
      message,
      ...(code ? { code } : {}),
      ...(errors ? { errors } : {}),
      ...(retryAfterSeconds !== undefined ? { retryAfterSeconds } : {}),
    });
  }
}
