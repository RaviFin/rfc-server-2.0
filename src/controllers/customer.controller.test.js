const customerController = require('../controllers/customer.controller');

test('should create a customer', () => {
    const req = { body: { name: 'John Doe', email: 'john@example.com' } };
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    customerController.create(req, res);
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ name: 'John Doe' }));
});

test('should return a customer by ID', () => {
    const req = { params: { id: '1' } };
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    customerController.getById(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ id: '1' }));
});