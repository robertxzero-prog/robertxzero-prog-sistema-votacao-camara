import { Module } from '@nestjs/common';

import { PrismaModule } from '../prisma/prisma.module';

import { AtasController } from './atas.controller';
import { AtasService } from './atas.service';

@Module({
  imports: [PrismaModule],
  controllers: [AtasController],
  providers: [AtasService],
  exports: [AtasService],
})
export class AtasModule {}
