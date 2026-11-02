import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  async onModuleInit() { //Kết nối Db
    await this.$connect();
  }

  async onModuleDestroy() {//Ngắt kết nối Db
    await this.$disconnect();
  }
}
