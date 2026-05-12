import { Test, TestingModule } from '@nestjs/testing';
import { AtasController } from './atas.controller';

describe('AtasController', () => {
  let controller: AtasController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AtasController],
    }).compile();

    controller = module.get<AtasController>(AtasController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
