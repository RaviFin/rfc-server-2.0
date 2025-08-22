const { MongoClient } = require('mongodb');

describe('Transaction Model', () => {
	let client;
	let db;

	beforeAll(async () => {
		client = await MongoClient.connect('mongodb://localhost:27017/test', { useNewUrlParser: true, useUnifiedTopology: true });
		db = client.db();
	});

	afterAll(async () => {
		await client.close();
	});

	test('should create a transaction', async () => {
		const transaction = { amount: 100, type: 'credit' };
		const result = await db.collection('transactions').insertOne(transaction);
		expect(result.insertedCount).toBe(1);
	});

	test('should retrieve a transaction', async () => {
		const transaction = await db.collection('transactions').findOne({ amount: 100 });
		expect(transaction).toHaveProperty('amount', 100);
		expect(transaction).toHaveProperty('type', 'credit');
	});
});