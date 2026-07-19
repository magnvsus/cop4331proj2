process.env.JWT_SECRET = 'test-secret';

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const authController = require('./authController');
const { mockRequest, mockResponse } = require('../testUtils/expressMocks');

jest.mock('../models/User');
jest.mock('bcryptjs');
jest.mock('jsonwebtoken');

describe('authController.register', () => {
  it('rejects registration when the email is already taken', async () => {
    User.findOne.mockResolvedValue({ _id: 'existing-id' });
    const req = mockRequest({ body: { email: 'taken@example.com', password: 'secret' } });
    const res = mockResponse();

    await authController.register(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'Email is already registered' });
  });

  it('hashes the password and creates a new user', async () => {
    User.findOne.mockResolvedValue(null);
    bcrypt.genSalt.mockResolvedValue('salt');
    bcrypt.hash.mockResolvedValue('hashed-password');
    const save = jest.fn().mockResolvedValue(undefined);
    User.mockImplementation(function (data) {
      Object.assign(this, data);
      this.save = save;
    });

    const req = mockRequest({ body: { email: 'new@example.com', password: 'plain-password' } });
    const res = mockResponse();

    await authController.register(req, res);

    expect(bcrypt.hash).toHaveBeenCalledWith('plain-password', 'salt');
    expect(User).toHaveBeenCalledWith({ email: 'new@example.com', password: 'hashed-password' });
    expect(save).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({ message: 'User registered successfully' });
  });

  it('returns a 500 when something unexpected fails', async () => {
    User.findOne.mockRejectedValue(new Error('db down'));
    const req = mockRequest({ body: { email: 'x@example.com', password: 'pw' } });
    const res = mockResponse();

    await authController.register(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
  });
});

describe('authController.login', () => {
  function mockFindOneWithPassword(user) {
    User.findOne.mockReturnValue({ select: jest.fn().mockResolvedValue(user) });
  }

  it('rejects an unknown email', async () => {
    mockFindOneWithPassword(null);
    const req = mockRequest({ body: { email: 'ghost@example.com', password: 'pw' } });
    const res = mockResponse();

    await authController.login(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Invalid email or password' });
  });

  it('rejects an incorrect password', async () => {
    mockFindOneWithPassword({ _id: 'u1', email: 'user@example.com', password: 'hashed' });
    bcrypt.compare.mockResolvedValue(false);
    const req = mockRequest({ body: { email: 'user@example.com', password: 'wrong' } });
    const res = mockResponse();

    await authController.login(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Invalid email or password' });
  });

  it('returns a token and user info on success', async () => {
    mockFindOneWithPassword({
      _id: 'u1',
      email: 'user@example.com',
      password: 'hashed',
      isVerified: true,
      bannerImage: 'banner.png',
    });
    bcrypt.compare.mockResolvedValue(true);
    jwt.sign.mockReturnValue('signed.jwt.token');

    const req = mockRequest({ body: { email: 'user@example.com', password: 'correct' } });
    const res = mockResponse();

    await authController.login(req, res);

    expect(jwt.sign).toHaveBeenCalledWith({ userId: 'u1' }, process.env.JWT_SECRET, { expiresIn: '24h' });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      token: 'signed.jwt.token',
      user: { id: 'u1', email: 'user@example.com', isVerified: true, bannerImage: 'banner.png' },
      error: '',
    });
  });

  it('defaults bannerImage to an empty string when the user has none', async () => {
    mockFindOneWithPassword({ _id: 'u1', email: 'user@example.com', password: 'hashed', isVerified: false });
    bcrypt.compare.mockResolvedValue(true);
    jwt.sign.mockReturnValue('signed.jwt.token');

    const req = mockRequest({ body: { email: 'user@example.com', password: 'correct' } });
    const res = mockResponse();

    await authController.login(req, res);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ user: expect.objectContaining({ bannerImage: '' }) })
    );
  });

  it('returns a 500 when something unexpected fails', async () => {
    User.findOne.mockImplementation(() => {
      throw new Error('db down');
    });
    const req = mockRequest({ body: { email: 'x@example.com', password: 'pw' } });
    const res = mockResponse();

    await authController.login(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
  });
});
