import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';

describe('GET /health', () => {
  it('reports readiness', async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    const app = module.createNestApplication();

    try {
      await app.init();
      await request(app.getHttpServer()).get('/health').expect(200, { status: 'ok' });
    } finally {
      await app.close();
    }
  });
});
