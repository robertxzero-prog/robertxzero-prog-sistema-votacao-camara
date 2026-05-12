import { Module } from '@nestjs/common';

import { PautasController } from './pautas.controller';
import { PautasService } from './pautas.service';

import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],

  controllers: [PautasController],

  providers: [PautasService],
})
export class PautasModule {}