import { Module, Global } from '@nestjs/common';
import { RealtimeService } from './realtime.service.js';
import { RealtimeController } from './realtime.controller.js';
import { DatabaseModule } from '../../database/database.module.js';

@Global()
@Module({
  imports: [DatabaseModule],
  controllers: [RealtimeController],
  providers: [RealtimeService],
  exports: [RealtimeService],
})
export class RealtimeModule {}
