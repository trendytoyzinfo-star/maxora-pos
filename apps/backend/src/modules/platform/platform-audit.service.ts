import { Injectable } from '@nestjs/common';
import { PlatformRawDb } from './platform-raw-db.service';

export interface AuditRecordInput {
  actorId?: string;
  action: string;
  entity: string;
  entityId?: string;
  before?: object;
  after?: object;
  ip?: string;
  device?: string;
}

/** Immutable audit log — only create and read, never update or delete. */
@Injectable()
export class PlatformAuditService {
  constructor(private readonly rawDb: PlatformRawDb) {}

  async record(input: AuditRecordInput) {
    return this.rawDb.createAuditLog(input);
  }

  async list(params: {
    actorId?: string;
    entity?: string;
    skip?: number;
    take?: number;
  }) {
    return this.rawDb.listAuditLogs(params);
  }
}
