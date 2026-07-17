process.env.JWT_SECRET = 'test-secret';

const jwt = require('jsonwebtoken');
const authMiddleware = require('./authMiddleware');
const { mockRequest, mockResponse } = require('../testUtils/expressMocks');

jest.mock('jsonwebtoken');

describe('authMiddleware', () => {
  it('rejects a request with no Authorization header', () => {
    const req = mockRequest();
    const res = mockResponse();
    const next = jest.fn();

    authMiddleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'acess denied. no token provided.' });
    expect(next).not.toHaveBeenCalled();
  });

  it('rejects a header that is not a Bearer token', () => {
    const req = mockRequest({ headers: { Authorization: 'Basic abc123' } });
    const res = mockResponse();
    const next = jest.fn();

    authMiddleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('rejects an invalid or expired token', () => {
    jwt.verify.mockImplementation(() => {
      throw new Error('bad token');
    });
    const req = mockRequest({ headers: { Authorization: 'Bearer badtoken' } });
    const res = mockResponse();
    const next = jest.fn();

    authMiddleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'Invalid token.' });
    expect(next).not.toHaveBeenCalled();
  });

  it('attaches the decoded user and calls next() for a valid token', () => {
    jwt.verify.mockReturnValue({ userId: 'user-123' });
    const req = mockRequest({ headers: { Authorization: 'Bearer goodtoken' } });
    const res = mockResponse();
    const next = jest.fn();

    authMiddleware(req, res, next);

    expect(jwt.verify).toHaveBeenCalledWith('goodtoken', process.env.JWT_SECRET);
    expect(req.user).toEqual({ userId: 'user-123' });
    expect(next).toHaveBeenCalled();
  });
});
