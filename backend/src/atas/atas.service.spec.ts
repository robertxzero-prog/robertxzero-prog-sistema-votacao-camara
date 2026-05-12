import { Test, TestingModule } from '@nestjs/testing';
import { AtasService } from './atas.service';

describe('AtasService', () => {
  let service: AtasService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [AtasService],
    }).compile();

    service = module.get<AtasService>(AtasService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
