import { Test, TestingModule } from '@nestjs/testing';
import { VotacoesController } from './votacoes.controller';

describe('VotacoesController', () => {
  let controller: VotacoesController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [VotacoesController],
    }).compile();

    controller = module.get<VotacoesController>(VotacoesController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
