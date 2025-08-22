const userController = require('../controllers/user.controller');

test('hello world!', () => {
	expect(userController.someFunction()).toBe(someExpectedValue);
});