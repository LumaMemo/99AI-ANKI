import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class NoteGenService {
  private readonly logger = new Logger(NoteGenService.name);

  async health() {
    return { status: 'ok' };
  }

  // placeholder for future methods (createJob/getJob/signUrl/admin operations)
}
