import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { PrismaClient, Prisma } from '@prisma/client';

export const POST_COMMIT_HOOKS = Symbol('POST_COMMIT_HOOKS');

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }

  /**
   * Overrides `$transaction` to attach a post-commit hook collector to interactive transactions.
   * Hooks registered on `tx[POST_COMMIT_HOOKS]` will execute sequentially ONLY AFTER
   * the database transaction has successfully committed.
   * If the transaction rolls back or throws, hooks are cleared and will NEVER be executed.
   */
  override $transaction<P extends Prisma.PrismaPromise<any>[]>(
    arg: [...P],
    options?: { isolationLevel?: Prisma.TransactionIsolationLevel },
  ): Promise<any>;
  override $transaction<R>(
    fn: (prisma: Prisma.TransactionClient) => Promise<R>,
    options?: { maxWait?: number; timeout?: number; isolationLevel?: Prisma.TransactionIsolationLevel },
  ): Promise<R>;
  override async $transaction(arg: any, options?: any): Promise<any> {
    if (typeof arg === 'function') {
      const hooks: Array<() => void | Promise<void>> = [];
      let result: any;
      try {
        result = await super.$transaction(async (tx: any) => {
          tx[POST_COMMIT_HOOKS] = hooks;
          return arg(tx);
        }, options);
      } catch (txError) {
        hooks.length = 0;
        throw txError;
      }

      for (const hook of hooks) {
        try {
          const hookResult = hook();
          if (hookResult instanceof Promise) {
            await hookResult;
          }
        } catch (err) {
          this.logger.error('Error executing transaction post-commit hook:', err);
        }
      }

      return result;
    }

    return super.$transaction(arg, options);
  }
}
