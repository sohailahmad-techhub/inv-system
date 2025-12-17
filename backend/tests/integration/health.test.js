const request = require('supertest');
const app = require('../../src/app');

describe('Health Check Endpoint', () => {
  it('should return 200 and status UP', async () => {
    const res = await request(app).get('/health');
    expect(res.statusCode).toEqual(200);
    expect(res.body.status).toEqual('UP');
    expect(res.body).toHaveProperty('timestamp');
  });
});
