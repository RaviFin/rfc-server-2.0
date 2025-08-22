const { MongoClient } = require('mongodb');

describe('Account Model', () => {
	let client;
	let db;

	beforeAll(async () => {
		client = await MongoClient.connect('mongodb://localhost:27017', { useNewUrlParser: true, useUnifiedTopology: true });
		db = client.db('testdb');
	});

	afterAll(async () => {
		await client.close();
	});

	test('should create an account', async () => {
		const account = { name: 'Test Account', balance: 100 };
		const result = await db.collection('accounts').insertOne(account);
		expect(result.insertedCount).toBe(1);
	});

	test('should retrieve an account', async () => {
		const account = await db.collection('accounts').findOne({ name: 'Test Account' });
		expect(account).toHaveProperty('name', 'Test Account');
		expect(account).toHaveProperty('balance', 100);
	});
});