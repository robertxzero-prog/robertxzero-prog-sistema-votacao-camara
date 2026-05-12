import { Test, TestingModule } from '@nestjs/testing';
import { PautasController } from './pautas.controller';

describe('PautasController', () => {
  let controller: PautasController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PautasController],
    }).compile();

    controller = module.get<PautasController>(PautasController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
