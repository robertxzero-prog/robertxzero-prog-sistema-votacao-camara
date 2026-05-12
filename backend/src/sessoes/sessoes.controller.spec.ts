import { Test, TestingModule } from '@nestjs/testing';
import { SessoesController } from './sessoes.controller';

describe('SessoesController', () => {
  let controller: SessoesController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [SessoesController],
    }).compile();

    controller = module.get<SessoesController>(SessoesController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
