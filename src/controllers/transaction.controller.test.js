const request = require('supertest');
const app = require('../app');

describe('Transaction Controller', () => {
	test('should create a transaction', async () => {
		const response = await request(app)
			.post('/transactions')
			.send({ amount: 100, type: 'credit' });
		expect(response.statusCode).toBe(201);
		expect(response.body).toHaveProperty('id');
	});

	test('should return a list of transactions', async () => {
		const response = await request(app).get('/transactions');
		expect(response.statusCode).toBe(200);
		expect(Array.isArray(response.body)).toBe(true);
	});
});