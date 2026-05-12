import { Test, TestingModule } from '@nestjs/testing';
import { PautasService } from './pautas.service';

describe('PautasService', () => {
  let service: PautasService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [PautasService],
    }).compile();

    service = module.get<PautasService>(PautasService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
