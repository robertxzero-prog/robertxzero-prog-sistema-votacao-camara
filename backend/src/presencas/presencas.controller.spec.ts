import { Test, TestingModule } from '@nestjs/testing';
import { PresencasController } from './presencas.controller';

describe('PresencasController', () => {
  let controller: PresencasController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PresencasController],
    }).compile();

    controller = module.get<PresencasController>(PresencasController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
