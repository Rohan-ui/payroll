import { Request } from 'express';

export interface RequestWithTenant extends Request {
  tenantId?: string;
  user?: {
    userId: string;
    email: string;
    tenantMemberId?: string;
    roles?: string[];
  };
}
