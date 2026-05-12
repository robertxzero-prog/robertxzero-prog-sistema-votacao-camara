import { Test, TestingModule } from '@nestjs/testing';
import { VotacoesService } from './votacoes.service';

describe('VotacoesService', () => {
  let service: VotacoesService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [VotacoesService],
    }).compile();

    service = module.get<VotacoesService>(VotacoesService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
