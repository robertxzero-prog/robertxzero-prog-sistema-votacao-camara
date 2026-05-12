import { Test, TestingModule } from '@nestjs/testing';
import { PresencasService } from './presencas.service';

describe('PresencasService', () => {
  let service: PresencasService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [PresencasService],
    }).compile();

    service = module.get<PresencasService>(PresencasService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
