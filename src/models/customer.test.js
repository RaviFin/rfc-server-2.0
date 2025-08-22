const { MongoClient } = require('mongodb');
const Customer = require('../../models/customer');

let client;
let db;

beforeAll(async () => {
	client = await MongoClient.connect('mongodb://localhost:27017/test', { useNewUrlParser: true, useUnifiedTopology: true });
	db = client.db();
});

afterAll(async () => {
	await client.close();
});

test('Customer model should create a new customer', async () => {
	const customerData = { name: 'John Doe', email: 'john@example.com' };
	const customer = await Customer.create(customerData);
	expect(customer).toHaveProperty('_id');
	expect(customer.name).toBe(customerData.name);
	expect(customer.email).toBe(customerData.email);
});