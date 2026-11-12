import { Module } from '@nestjs/common';
import { TeamActivityService } from './team-activity.service.js';

@Module({
  providers: [TeamActivityService],
  exports: [TeamActivityService],
})
export class TeamActivityModule {}
