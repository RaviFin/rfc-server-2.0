const { MongoClient } = require('mongodb');
const Loan = require('./loan');

let db;

beforeAll(async () => {
  const client = await MongoClient.connect('mongodb://localhost:27017/test', { useNewUrlParser: true, useUnifiedTopology: true });
  db = client.db();
  await db.collection('loans').deleteMany({});
});

afterAll(async () => {
  await db.collection('loans').deleteMany({});
  await db.close();
});

test('create a loan', async () => {
  const loanData = { amount: 1000, term: 12 };
  const loan = await Loan.create(loanData);
  expect(loan).toHaveProperty('_id');
  expect(loan.amount).toBe(1000);
  expect(loan.term).toBe(12);
});

test('find a loan', async () => {
  const loanData = { amount: 2000, term: 24 };
  const loan = await Loan.create(loanData);
  const foundLoan = await Loan.findById(loan._id);
  expect(foundLoan.amount).toBe(2000);
  expect(foundLoan.term).toBe(24);
});