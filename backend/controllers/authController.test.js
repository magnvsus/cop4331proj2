process.env.JWT_SECRET = 'test-secret';

const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const fs = require('fs/promises');
const User = require('../models/User');
const Item = require('../models/Item');
const Category = require('../models/Category');
const mailer = require('../utils/mailer');
const authController = require('./authController');
const { mockRequest, mockResponse } = require('../testUtils/expressMocks');

const DEFAULT_SETTINGS = {
  companyName: 'Coffee Hour',
  businessType: 'Coffee shop',
  managerName: 'Alex Morgan',
  accentColor: '#a9642e',
  notificationsEnabled: false,
  notificationFrequency: 'immediate',
};

jest.mock('../models/User');
jest.mock('../models/Item');
jest.mock('../models/Category');
jest.mock('bcryptjs');
jest.mock('jsonwebtoken');
jest.mock('fs/promises');
jest.mock('../utils/mailer');

beforeEach(() => {
  mailer.sendVerificationEmail.mockResolvedValue(undefined);
  mailer.sendAccountDeletedEmail.mockResolvedValue(undefined);
});

describe('authController.register', () => {
  it('rejects registration with a missing email or password', async () => {
    const req = mockRequest({ body: { email: '', password: 'secret' } });
    const res = mockResponse();

    await authController.register(req, res);

    expect(User.findOne).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'Email and password are required' });
  });

  it('rejects a password shorter than 6 characters', async () => {
    const req = mockRequest({ body: { email: 'new@example.com', password: 'short' } });
    const res = mockResponse();

    await authController.register(req, res);

    expect(User.findOne).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'Password must be at least 6 characters' });
  });

  it('rejects registration when the email is already taken', async () => {
    User.findOne.mockResolvedValue({ _id: 'existing-id' });
    const req = mockRequest({ body: { email: 'taken@example.com', password: 'secret' } });
    const res = mockResponse();

    await authController.register(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'Email is already registered' });
  });

  it('still rejects when the existing account is deactivated but not yet past its deletion grace', async () => {
    User.findOne.mockResolvedValue({
      _id: 'existing-id',
      email: 'taken@example.com',
      // Deactivated, but only 1 second ago -- nowhere near the 7-day default grace.
      deactivatesAt: new Date(Date.now() - 1000),
    });
    const req = mockRequest({ body: { email: 'taken@example.com', password: 'secret' } });
    const res = mockResponse();

    await authController.register(req, res);

    expect(User.findByIdAndDelete).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'Email is already registered' });
  });

  it('reclaims the email by deleting an abandoned account past its deletion grace, then registers the new one', async () => {
    const existingUser = {
      _id: 'old-id',
      email: 'taken@example.com',
      bannerImage: '/uploads/old-banner.jpg',
      // Deactivated 8 days ago -- past the 7-day default grace period, i.e.
      // it never got (re)verified in time and is effectively abandoned.
      deactivatesAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000),
    };
    User.findOne.mockResolvedValue(existingUser);
    Item.find.mockResolvedValue([]);
    Item.deleteMany.mockResolvedValue({});
    Category.deleteMany.mockResolvedValue({});
    User.findByIdAndDelete.mockResolvedValue({});
    fs.unlink.mockResolvedValue(undefined);
    bcrypt.genSalt.mockResolvedValue('salt');
    bcrypt.hash.mockResolvedValue('hashed-password');
    User.mockImplementation(function (data) {
      Object.assign(this, data);
      this.save = jest.fn().mockResolvedValue(undefined);
    });

    const req = mockRequest({ body: { email: 'taken@example.com', password: 'plain-password' } });
    const res = mockResponse();

    await authController.register(req, res);

    expect(Item.deleteMany).toHaveBeenCalledWith({ accountID: 'old-id' });
    expect(Category.deleteMany).toHaveBeenCalledWith({ accountID: 'old-id' });
    expect(User.findByIdAndDelete).toHaveBeenCalledWith('old-id');
    expect(mailer.sendAccountDeletedEmail).toHaveBeenCalledWith('taken@example.com');
    // ...and still goes on to actually create the new account.
    expect(User).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'taken@example.com', password: 'hashed-password' })
    );
    expect(res.status).toHaveBeenCalledWith(201);
  });

  it('hashes the password, creates a new user with a verification token, and emails it', async () => {
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
    expect(User).toHaveBeenCalledWith({
      email: 'new@example.com',
      password: 'hashed-password',
      emailVerificationToken: expect.any(String),
      emailVerificationExpires: expect.any(Number),
      deactivatesAt: expect.any(Date),
    });
    expect(save).toHaveBeenCalled();

    // The token handed to the mailer must be the raw value, not the hash
    // that got stored on the user -- otherwise the link in the email could
    // never match what's saved.
    const [, rawToken] = mailer.sendVerificationEmail.mock.calls[0];
    const [userArg] = User.mock.calls[0];
    const expectedHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    expect(userArg.emailVerificationToken).toBe(expectedHash);
    expect(mailer.sendVerificationEmail).toHaveBeenCalledWith('new@example.com', rawToken);

    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({
      message: 'User registered successfully. Check your email to verify your account.',
    });
  });

  it('schedules deactivation ACCOUNT_DEACTIVATION_DAYS (default 7) days out at registration, not verification', async () => {
    const previous = process.env.ACCOUNT_DEACTIVATION_DAYS;
    delete process.env.ACCOUNT_DEACTIVATION_DAYS;
    try {
      User.findOne.mockResolvedValue(null);
      bcrypt.genSalt.mockResolvedValue('salt');
      bcrypt.hash.mockResolvedValue('hashed-password');
      User.mockImplementation(function (data) {
        Object.assign(this, data);
        this.save = jest.fn().mockResolvedValue(undefined);
      });

      const req = mockRequest({ body: { email: 'new@example.com', password: 'plain-password' } });
      const res = mockResponse();
      const before = Date.now();

      await authController.register(req, res);

      const [userArg] = User.mock.calls[0];
      const expectedMs = 7 * 24 * 60 * 60 * 1000;
      expect(userArg.deactivatesAt).toBeInstanceOf(Date);
      expect(userArg.deactivatesAt.getTime()).toBeGreaterThanOrEqual(before + expectedMs);
      expect(userArg.deactivatesAt.getTime()).toBeLessThanOrEqual(Date.now() + expectedMs);
    } finally {
      process.env.ACCOUNT_DEACTIVATION_DAYS = previous;
    }
  });

  it('still succeeds if sending the verification email fails', async () => {
    User.findOne.mockResolvedValue(null);
    bcrypt.genSalt.mockResolvedValue('salt');
    bcrypt.hash.mockResolvedValue('hashed-password');
    User.mockImplementation(function (data) {
      Object.assign(this, data);
      this.save = jest.fn().mockResolvedValue(undefined);
    });
    mailer.sendVerificationEmail.mockRejectedValue(new Error('SMTP down'));

    const req = mockRequest({ body: { email: 'new@example.com', password: 'plain-password' } });
    const res = mockResponse();

    await authController.register(req, res);

    expect(res.status).toHaveBeenCalledWith(201);
  });

  it('returns a 500 when something unexpected fails', async () => {
    User.findOne.mockRejectedValue(new Error('db down'));
    const req = mockRequest({ body: { email: 'x@example.com', password: 'long-enough' } });
    const res = mockResponse();

    await authController.register(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
  });
});

describe('authController.verifyEmail', () => {
  it('rejects an invalid or expired token', async () => {
    User.findOne.mockResolvedValue(null);
    const req = mockRequest({ params: { token: 'bogus-token' } });
    const res = mockResponse();

    await authController.verifyEmail(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.type).toHaveBeenCalledWith('html');
    expect(res.send).toHaveBeenCalledWith(expect.stringContaining('Verification failed'));
  });

  it('looks up the user by the hash of the token (never the raw token) and checks expiry', async () => {
    User.findOne.mockResolvedValue(null);
    const req = mockRequest({ params: { token: 'raw-token' } });
    const res = mockResponse();

    await authController.verifyEmail(req, res);

    const expectedHash = crypto.createHash('sha256').update('raw-token').digest('hex');
    expect(User.findOne).toHaveBeenCalledWith({
      emailVerificationToken: expectedHash,
      emailVerificationExpires: { $gt: expect.any(Number) },
    });
  });

  it('marks the account verified, clears the token, and clears deactivatesAt for good on success', async () => {
    const save = jest.fn().mockResolvedValue(undefined);
    const user = {
      isVerified: false,
      emailVerificationToken: 'hash',
      emailVerificationExpires: Date.now() + 1000,
      deactivatesAt: new Date(Date.now() + 1000), // e.g. a still-unexpired registration deadline
      save,
    };
    User.findOne.mockResolvedValue(user);
    const req = mockRequest({ params: { token: 'raw-token' } });
    const res = mockResponse();

    await authController.verifyEmail(req, res);

    expect(user.isVerified).toBe(true);
    expect(user.emailVerificationToken).toBeUndefined();
    expect(user.emailVerificationExpires).toBeUndefined();
    // Verifying is a one-time gate, not a recurring clock -- deactivatesAt
    // is cleared, not pushed forward to another future date.
    expect(user.deactivatesAt).toBeUndefined();
    expect(save).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.type).toHaveBeenCalledWith('html');
    expect(res.send).toHaveBeenCalledWith(expect.stringContaining('Account confirmed'));
  });

  it('clears deactivatesAt even when reactivating an already-deactivated account', async () => {
    const save = jest.fn().mockResolvedValue(undefined);
    const user = {
      isVerified: false,
      emailVerificationToken: 'hash',
      emailVerificationExpires: Date.now() + 1000,
      deactivatesAt: new Date(Date.now() - 60 * 1000), // already past its deadline
      save,
    };
    User.findOne.mockResolvedValue(user);
    const req = mockRequest({ params: { token: 'raw-token' } });
    const res = mockResponse();

    await authController.verifyEmail(req, res);

    expect(user.deactivatesAt).toBeUndefined();
  });

  it('returns a 500 page when something unexpected fails', async () => {
    User.findOne.mockRejectedValue(new Error('db down'));
    const req = mockRequest({ params: { token: 'raw-token' } });
    const res = mockResponse();

    await authController.verifyEmail(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.type).toHaveBeenCalledWith('html');
  });
});

describe('authController.resendVerification', () => {
  function mockFindByIdWithExpires(user) {
    User.findById.mockReturnValue({ select: jest.fn().mockResolvedValue(user) });
  }

  it('returns 404 when the user does not exist', async () => {
    mockFindByIdWithExpires(null);
    const req = mockRequest({ user: { userId: 'u1' } });
    const res = mockResponse();

    await authController.resendVerification(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(mailer.sendVerificationEmail).not.toHaveBeenCalled();
  });

  it('rejects an already-verified account', async () => {
    mockFindByIdWithExpires({ _id: 'u1', isVerified: true });
    const req = mockRequest({ user: { userId: 'u1' } });
    const res = mockResponse();

    await authController.resendVerification(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'Account is already verified' });
    expect(mailer.sendVerificationEmail).not.toHaveBeenCalled();
  });

  it('enforces a 60s cooldown between sends, even calling the endpoint directly', async () => {
    // A token issued 10 seconds ago -- still well within the 60s cooldown.
    const expires = new Date(Date.now() + 24 * 60 * 60 * 1000 - 10 * 1000);
    mockFindByIdWithExpires({ _id: 'u1', isVerified: false, emailVerificationExpires: expires });
    const req = mockRequest({ user: { userId: 'u1' } });
    const res = mockResponse();

    await authController.resendVerification(req, res);

    expect(res.status).toHaveBeenCalledWith(429);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ retryAfterSeconds: expect.any(Number) })
    );
    expect(mailer.sendVerificationEmail).not.toHaveBeenCalled();
  });

  it('issues a new token and sends it once the cooldown has passed', async () => {
    const save = jest.fn().mockResolvedValue(undefined);
    // A token issued 23h59m50s ago -- cooldown (60s) has elapsed.
    const expires = new Date(Date.now() + 10 * 1000);
    const user = {
      _id: 'u1',
      email: 'user@example.com',
      isVerified: false,
      emailVerificationExpires: expires,
      save,
    };
    mockFindByIdWithExpires(user);
    const req = mockRequest({ user: { userId: 'u1' } });
    const res = mockResponse();

    await authController.resendVerification(req, res);

    expect(user.emailVerificationToken).toEqual(expect.any(String));
    expect(save).toHaveBeenCalled();
    expect(mailer.sendVerificationEmail).toHaveBeenCalledWith(
      'user@example.com',
      expect.any(String),
      'verify'
    );
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ message: 'Verification email sent' });
  });

  it('treats a user with no prior token as eligible to send immediately', async () => {
    const save = jest.fn().mockResolvedValue(undefined);
    const user = { _id: 'u1', email: 'user@example.com', isVerified: false, save };
    mockFindByIdWithExpires(user);
    const req = mockRequest({ user: { userId: 'u1' } });
    const res = mockResponse();

    await authController.resendVerification(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('returns a 500 when sending fails', async () => {
    const save = jest.fn().mockResolvedValue(undefined);
    const user = { _id: 'u1', email: 'user@example.com', isVerified: false, save };
    mockFindByIdWithExpires(user);
    mailer.sendVerificationEmail.mockRejectedValue(new Error('SMTP down'));
    const req = mockRequest({ user: { userId: 'u1' } });
    const res = mockResponse();

    await authController.resendVerification(req, res);

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
      settings: {
        companyName: 'Roast Co',
        businessType: 'Coffee shop',
        managerName: 'Sam Lee',
        accentColor: '#112233',
        notificationsEnabled: true,
        notificationFrequency: 'hourly',
      },
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
      user: {
        id: 'u1',
        email: 'user@example.com',
        isVerified: true,
        bannerImage: 'banner.png',
        deactivatesAt: null,
        settings: {
          companyName: 'Roast Co',
          businessType: 'Coffee shop',
          managerName: 'Sam Lee',
          accentColor: '#112233',
          notificationsEnabled: true,
          notificationFrequency: 'hourly',
        },
      },
      error: '',
    });
  });

  it('returns the account deactivatesAt when it is set but still in the future', async () => {
    const deactivatesAt = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000);
    mockFindOneWithPassword({
      _id: 'u1',
      email: 'user@example.com',
      password: 'hashed',
      isVerified: true,
      deactivatesAt,
    });
    bcrypt.compare.mockResolvedValue(true);
    jwt.sign.mockReturnValue('signed.jwt.token');

    const req = mockRequest({ body: { email: 'user@example.com', password: 'correct' } });
    const res = mockResponse();

    await authController.login(req, res);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ user: expect.objectContaining({ deactivatesAt }) })
    );
  });

  it('defaults bannerImage and settings when the user has none', async () => {
    mockFindOneWithPassword({ _id: 'u1', email: 'user@example.com', password: 'hashed', isVerified: false });
    bcrypt.compare.mockResolvedValue(true);
    jwt.sign.mockReturnValue('signed.jwt.token');

    const req = mockRequest({ body: { email: 'user@example.com', password: 'correct' } });
    const res = mockResponse();

    await authController.login(req, res);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        user: expect.objectContaining({ bannerImage: '', settings: DEFAULT_SETTINGS }),
      })
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

  it('honors JWT_EXPIRES_IN when it is set, instead of the hardcoded default', async () => {
    const previous = process.env.JWT_EXPIRES_IN;
    process.env.JWT_EXPIRES_IN = '7d';
    try {
      mockFindOneWithPassword({ _id: 'u1', email: 'user@example.com', password: 'hashed' });
      bcrypt.compare.mockResolvedValue(true);
      jwt.sign.mockReturnValue('signed.jwt.token');

      const req = mockRequest({ body: { email: 'user@example.com', password: 'correct' } });
      const res = mockResponse();

      await authController.login(req, res);

      expect(jwt.sign).toHaveBeenCalledWith({ userId: 'u1' }, process.env.JWT_SECRET, {
        expiresIn: '7d',
      });
    } finally {
      process.env.JWT_EXPIRES_IN = previous;
    }
  });

  it('rejects a login once deactivatesAt has elapsed, and auto-sends a reactivation email', async () => {
    const save = jest.fn().mockResolvedValue(undefined);
    mockFindOneWithPassword({
      _id: 'u1',
      email: 'user@example.com',
      password: 'hashed',
      isVerified: true,
      deactivatesAt: new Date(Date.now() - 1000), // 1s past deactivation, well within the 7-day grace default
      save,
    });
    bcrypt.compare.mockResolvedValue(true);
    const req = mockRequest({ body: { email: 'user@example.com', password: 'correct' } });
    const res = mockResponse();

    await authController.login(req, res);

    expect(jwt.sign).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'ACCOUNT_DEACTIVATED' })
    );
    expect(mailer.sendVerificationEmail).toHaveBeenCalledWith(
      'user@example.com',
      expect.any(String),
      'reactivate'
    );
    expect(save).toHaveBeenCalled();
  });

  it('rejects a login for an account that never verified in time, same as one that verified and went unused', async () => {
    const save = jest.fn().mockResolvedValue(undefined);
    mockFindOneWithPassword({
      _id: 'u1',
      email: 'user@example.com',
      password: 'hashed',
      isVerified: false,
      // deactivatesAt is set at registration now, so an unverified account
      // can still hit this -- it's no longer only reachable post-verification.
      deactivatesAt: new Date(Date.now() - 1000),
      save,
    });
    bcrypt.compare.mockResolvedValue(true);
    const req = mockRequest({ body: { email: 'user@example.com', password: 'correct' } });
    const res = mockResponse();

    await authController.login(req, res);

    expect(jwt.sign).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'ACCOUNT_DEACTIVATED' })
    );
    expect(mailer.sendVerificationEmail).toHaveBeenCalledWith(
      'user@example.com',
      expect.any(String),
      'reactivate'
    );
  });

  it('does not auto-send a reactivation email while the resend cooldown is still active', async () => {
    const save = jest.fn().mockResolvedValue(undefined);
    mockFindOneWithPassword({
      _id: 'u1',
      email: 'user@example.com',
      password: 'hashed',
      isVerified: true,
      deactivatesAt: new Date(Date.now() - 1000),
      // A token issued 10s ago -- well within the 60s cooldown.
      emailVerificationExpires: new Date(Date.now() + 24 * 60 * 60 * 1000 - 10 * 1000),
      save,
    });
    bcrypt.compare.mockResolvedValue(true);
    const req = mockRequest({ body: { email: 'user@example.com', password: 'correct' } });
    const res = mockResponse();

    await authController.login(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'ACCOUNT_DEACTIVATED' })
    );
    expect(mailer.sendVerificationEmail).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
  });

  it('permanently deletes an account once ACCOUNT_DELETION_GRACE_DAYS has passed since deactivation', async () => {
    mockFindOneWithPassword({
      _id: 'u1',
      email: 'user@example.com',
      password: 'hashed',
      isVerified: true,
      bannerImage: '/uploads/banner.jpg',
      // Deactivated 8 days ago -- past the 7-day default grace period.
      deactivatesAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000),
    });
    bcrypt.compare.mockResolvedValue(true);
    Item.find.mockResolvedValue([{ pictureURL: '/uploads/item1.jpg' }]);
    Item.deleteMany.mockResolvedValue({});
    Category.deleteMany.mockResolvedValue({});
    User.findByIdAndDelete.mockResolvedValue({});
    fs.unlink.mockResolvedValue(undefined);
    const req = mockRequest({ body: { email: 'user@example.com', password: 'correct' } });
    const res = mockResponse();

    await authController.login(req, res);

    expect(Item.deleteMany).toHaveBeenCalledWith({ accountID: 'u1' });
    expect(Category.deleteMany).toHaveBeenCalledWith({ accountID: 'u1' });
    expect(User.findByIdAndDelete).toHaveBeenCalledWith('u1');
    expect(fs.unlink).toHaveBeenCalledWith(expect.stringContaining('item1.jpg'));
    expect(fs.unlink).toHaveBeenCalledWith(expect.stringContaining('banner.jpg'));
    expect(mailer.sendVerificationEmail).not.toHaveBeenCalled();
    expect(mailer.sendAccountDeletedEmail).toHaveBeenCalledWith('user@example.com');
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'ACCOUNT_DELETED' })
    );
  });

  it('still allows login before deactivatesAt is reached', async () => {
    mockFindOneWithPassword({
      _id: 'u1',
      email: 'user@example.com',
      password: 'hashed',
      isVerified: true,
      deactivatesAt: new Date(Date.now() + 1000),
    });
    bcrypt.compare.mockResolvedValue(true);
    jwt.sign.mockReturnValue('signed.jwt.token');
    const req = mockRequest({ body: { email: 'user@example.com', password: 'correct' } });
    const res = mockResponse();

    await authController.login(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
  });
});

describe('authController.getCurrentUser', () => {
  it('returns 404 when the user no longer exists', async () => {
    User.findById.mockResolvedValue(null);
    const req = mockRequest({ user: { userId: 'u1' } });
    const res = mockResponse();

    await authController.getCurrentUser(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('returns the current user and settings for a valid token', async () => {
    User.findById.mockResolvedValue({
      _id: 'u1',
      email: 'user@example.com',
      isVerified: true,
      bannerImage: '/uploads/banner.jpg',
      settings: {
        companyName: 'Roast Co',
        businessType: 'Coffee shop',
        managerName: 'Sam Lee',
        accentColor: '#112233',
        notificationsEnabled: true,
        notificationFrequency: 'daily',
      },
    });
    const req = mockRequest({ user: { userId: 'u1' } });
    const res = mockResponse();

    await authController.getCurrentUser(req, res);

    expect(User.findById).toHaveBeenCalledWith('u1');
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      user: {
        id: 'u1',
        email: 'user@example.com',
        isVerified: true,
        bannerImage: '/uploads/banner.jpg',
        deactivatesAt: null,
        settings: {
          companyName: 'Roast Co',
          businessType: 'Coffee shop',
          managerName: 'Sam Lee',
          accentColor: '#112233',
          notificationsEnabled: true,
          notificationFrequency: 'daily',
        },
      },
      error: '',
    });
  });

  it('returns a 500 when something unexpected fails', async () => {
    User.findById.mockRejectedValue(new Error('db down'));
    const req = mockRequest({ user: { userId: 'u1' } });
    const res = mockResponse();

    await authController.getCurrentUser(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
  });

  it('rejects restoring a session for a deactivated account', async () => {
    User.findById.mockResolvedValue({
      _id: 'u1',
      email: 'user@example.com',
      isVerified: true,
      deactivatesAt: new Date(Date.now() - 1000),
    });
    const req = mockRequest({ user: { userId: 'u1' } });
    const res = mockResponse();

    await authController.getCurrentUser(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'ACCOUNT_DEACTIVATED' })
    );
  });

  it('permanently deletes an account once ACCOUNT_DELETION_GRACE_DAYS has passed, on session restore too', async () => {
    User.findById.mockResolvedValue({
      _id: 'u1',
      email: 'user@example.com',
      isVerified: true,
      bannerImage: '',
      deactivatesAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000),
    });
    Item.find.mockResolvedValue([]);
    Item.deleteMany.mockResolvedValue({});
    Category.deleteMany.mockResolvedValue({});
    User.findByIdAndDelete.mockResolvedValue({});
    const req = mockRequest({ user: { userId: 'u1' } });
    const res = mockResponse();

    await authController.getCurrentUser(req, res);

    expect(User.findByIdAndDelete).toHaveBeenCalledWith('u1');
    expect(mailer.sendAccountDeletedEmail).toHaveBeenCalledWith('user@example.com');
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'ACCOUNT_DELETED' })
    );
  });
});

describe('authController.updateBanner', () => {
  beforeEach(() => {
    fs.unlink.mockResolvedValue(undefined);
  });

  it('returns 404 when the user does not exist', async () => {
    User.findById.mockResolvedValue(null);
    const req = mockRequest({ body: { bannerImage: '/uploads/new.jpg' }, user: { userId: 'u1' } });
    const res = mockResponse();

    await authController.updateBanner(req, res);

    expect(User.findById).toHaveBeenCalledWith('u1');
    expect(User.findByIdAndUpdate).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('updates the banner and returns the user on success', async () => {
    User.findById.mockResolvedValue({ _id: 'u1', bannerImage: '' });
    User.findByIdAndUpdate.mockResolvedValue({
      _id: 'u1',
      email: 'user@example.com',
      isVerified: true,
      bannerImage: '/uploads/new.jpg',
    });
    const req = mockRequest({ body: { bannerImage: '/uploads/new.jpg' }, user: { userId: 'u1' } });
    const res = mockResponse();

    await authController.updateBanner(req, res);

    expect(User.findByIdAndUpdate).toHaveBeenCalledWith(
      'u1',
      { bannerImage: '/uploads/new.jpg' },
      { new: true, runValidators: true }
    );
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      user: { id: 'u1', email: 'user@example.com', isVerified: true, bannerImage: '/uploads/new.jpg' },
      error: '',
    });
  });

  it('deletes the old banner file when it is replaced by a new one', async () => {
    User.findById.mockResolvedValue({ _id: 'u1', bannerImage: '/uploads/old.jpg' });
    User.findByIdAndUpdate.mockResolvedValue({
      _id: 'u1',
      email: 'user@example.com',
      isVerified: true,
      bannerImage: '/uploads/new.jpg',
    });
    const req = mockRequest({ body: { bannerImage: '/uploads/new.jpg' }, user: { userId: 'u1' } });
    const res = mockResponse();

    await authController.updateBanner(req, res);

    expect(fs.unlink).toHaveBeenCalledWith(expect.stringContaining('old.jpg'));
  });

  it('does not delete an external bannerImage (e.g. a manually-set URL)', async () => {
    User.findById.mockResolvedValue({ _id: 'u1', bannerImage: 'https://images.unsplash.com/photo.jpg' });
    User.findByIdAndUpdate.mockResolvedValue({
      _id: 'u1',
      email: 'user@example.com',
      isVerified: true,
      bannerImage: '/uploads/new.jpg',
    });
    const req = mockRequest({ body: { bannerImage: '/uploads/new.jpg' }, user: { userId: 'u1' } });
    const res = mockResponse();

    await authController.updateBanner(req, res);

    expect(fs.unlink).not.toHaveBeenCalled();
  });

  it('returns a 500 when the update fails', async () => {
    User.findById.mockResolvedValue({ _id: 'u1', bannerImage: '' });
    User.findByIdAndUpdate.mockRejectedValue(new Error('db down'));
    const req = mockRequest({ body: { bannerImage: '/uploads/new.jpg' }, user: { userId: 'u1' } });
    const res = mockResponse();

    await authController.updateBanner(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
  });
});

describe('authController.updateSettings', () => {
  it('rejects an accentColor that is not a hex code', async () => {
    const req = mockRequest({ body: { accentColor: 'not-a-color' }, user: { userId: 'u1' } });
    const res = mockResponse();

    await authController.updateSettings(req, res);

    expect(User.findByIdAndUpdate).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('rejects a companyName over the length limit', async () => {
    const req = mockRequest({ body: { companyName: 'x'.repeat(61) }, user: { userId: 'u1' } });
    const res = mockResponse();

    await authController.updateSettings(req, res);

    expect(User.findByIdAndUpdate).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('rejects an empty request body', async () => {
    const req = mockRequest({ body: {}, user: { userId: 'u1' } });
    const res = mockResponse();

    await authController.updateSettings(req, res);

    expect(User.findByIdAndUpdate).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'No valid settings fields provided' });
  });

  it('ignores fields outside the settings whitelist instead of saving them', async () => {
    User.findByIdAndUpdate.mockResolvedValue({
      _id: 'u1',
      email: 'user@example.com',
      isVerified: false,
      bannerImage: '',
      settings: { companyName: 'Roast Co', businessType: 'Coffee shop', managerName: 'Alex Morgan', accentColor: '#a9642e' },
    });
    const req = mockRequest({
      body: { companyName: 'Roast Co', isVerified: true, password: 'hijacked' },
      user: { userId: 'u1' },
    });
    const res = mockResponse();

    await authController.updateSettings(req, res);

    expect(User.findByIdAndUpdate).toHaveBeenCalledWith(
      'u1',
      { $set: { 'settings.companyName': 'Roast Co' } },
      { new: true, runValidators: true }
    );
  });

  it('only ever updates the settings of the authenticated user (from the verified token)', async () => {
    User.findByIdAndUpdate.mockResolvedValue({
      _id: 'u1',
      email: 'user@example.com',
      isVerified: false,
      bannerImage: '',
      settings: { companyName: 'Roast Co', businessType: 'Coffee shop', managerName: 'Alex Morgan', accentColor: '#a9642e' },
    });
    // Even if the body tries to claim a different account, req.user.userId
    // (set by the auth middleware from the JWT) is what's actually used.
    const req = mockRequest({
      body: { companyName: 'Roast Co', accountID: 'someone-elses-id' },
      user: { userId: 'u1' },
    });
    const res = mockResponse();

    await authController.updateSettings(req, res);

    expect(User.findByIdAndUpdate).toHaveBeenCalledWith(
      'u1',
      { $set: { 'settings.companyName': 'Roast Co' } },
      { new: true, runValidators: true }
    );
  });

  it('trims text fields and saves valid updates', async () => {
    User.findByIdAndUpdate.mockResolvedValue({
      _id: 'u1',
      email: 'user@example.com',
      isVerified: true,
      bannerImage: '',
      settings: { companyName: 'Roast Co', businessType: 'Coffee shop', managerName: 'Sam Lee', accentColor: '#112233' },
    });
    const req = mockRequest({
      body: { companyName: '  Roast Co  ', managerName: 'Sam Lee', accentColor: '#112233' },
      user: { userId: 'u1' },
    });
    const res = mockResponse();

    await authController.updateSettings(req, res);

    expect(User.findByIdAndUpdate).toHaveBeenCalledWith(
      'u1',
      { $set: { 'settings.companyName': 'Roast Co', 'settings.managerName': 'Sam Lee', 'settings.accentColor': '#112233' } },
      { new: true, runValidators: true }
    );
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      user: {
        id: 'u1',
        email: 'user@example.com',
        isVerified: true,
        bannerImage: '',
        settings: {
          companyName: 'Roast Co',
          businessType: 'Coffee shop',
          managerName: 'Sam Lee',
          accentColor: '#112233',
          notificationsEnabled: false,
          notificationFrequency: 'immediate',
        },
      },
      error: '',
    });
  });

  it('rejects a non-boolean notificationsEnabled', async () => {
    const req = mockRequest({ body: { notificationsEnabled: 'yes' }, user: { userId: 'u1' } });
    const res = mockResponse();

    await authController.updateSettings(req, res);

    expect(User.findByIdAndUpdate).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('rejects a notificationFrequency outside the allowed enum', async () => {
    const req = mockRequest({ body: { notificationFrequency: 'weekly' }, user: { userId: 'u1' } });
    const res = mockResponse();

    await authController.updateSettings(req, res);

    expect(User.findByIdAndUpdate).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('saves valid notification settings', async () => {
    User.findByIdAndUpdate.mockResolvedValue({
      _id: 'u1',
      email: 'user@example.com',
      isVerified: true,
      bannerImage: '',
      settings: { notificationsEnabled: true, notificationFrequency: 'daily' },
    });
    const req = mockRequest({
      body: { notificationsEnabled: true, notificationFrequency: 'daily' },
      user: { userId: 'u1' },
    });
    const res = mockResponse();

    await authController.updateSettings(req, res);

    expect(User.findByIdAndUpdate).toHaveBeenCalledWith(
      'u1',
      { $set: { 'settings.notificationsEnabled': true, 'settings.notificationFrequency': 'daily' } },
      { new: true, runValidators: true }
    );
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        user: expect.objectContaining({
          settings: expect.objectContaining({ notificationsEnabled: true, notificationFrequency: 'daily' }),
        }),
      })
    );
  });

  it('returns 404 when the user does not exist', async () => {
    User.findByIdAndUpdate.mockResolvedValue(null);
    const req = mockRequest({ body: { companyName: 'Roast Co' }, user: { userId: 'ghost' } });
    const res = mockResponse();

    await authController.updateSettings(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('returns a 500 when the update fails', async () => {
    User.findByIdAndUpdate.mockRejectedValue(new Error('db down'));
    const req = mockRequest({ body: { companyName: 'Roast Co' }, user: { userId: 'u1' } });
    const res = mockResponse();

    await authController.updateSettings(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
  });
});

describe('authController.deleteAccount', () => {
  beforeEach(() => {
    fs.unlink.mockResolvedValue(undefined);
    Item.find.mockResolvedValue([]);
    Item.deleteMany.mockResolvedValue({});
    Category.deleteMany.mockResolvedValue({});
    User.findByIdAndDelete.mockResolvedValue({});
  });

  it('returns 404 when the user does not exist', async () => {
    User.findById.mockResolvedValue(null);
    const req = mockRequest({ user: { userId: 'u1' } });
    const res = mockResponse();

    await authController.deleteAccount(req, res);

    expect(User.findByIdAndDelete).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('deletes the account, its items and categories, and returns success', async () => {
    User.findById.mockResolvedValue({ _id: 'u1', bannerImage: '' });
    const req = mockRequest({ user: { userId: 'u1' } });
    const res = mockResponse();

    await authController.deleteAccount(req, res);

    expect(Item.deleteMany).toHaveBeenCalledWith({ accountID: 'u1' });
    expect(Category.deleteMany).toHaveBeenCalledWith({ accountID: 'u1' });
    expect(User.findByIdAndDelete).toHaveBeenCalledWith('u1');
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ message: 'Account deleted successfully', error: '' });
  });

  it("cleans up the account's uploaded item photos and banner image", async () => {
    User.findById.mockResolvedValue({ _id: 'u1', bannerImage: '/uploads/banner.jpg' });
    Item.find.mockResolvedValue([
      { pictureURL: '/uploads/item1.jpg' },
      { pictureURL: '/uploads/item2.jpg' },
    ]);
    const req = mockRequest({ user: { userId: 'u1' } });
    const res = mockResponse();

    await authController.deleteAccount(req, res);

    expect(fs.unlink).toHaveBeenCalledWith(expect.stringContaining('item1.jpg'));
    expect(fs.unlink).toHaveBeenCalledWith(expect.stringContaining('item2.jpg'));
    expect(fs.unlink).toHaveBeenCalledWith(expect.stringContaining('banner.jpg'));
  });

  it('returns a 500 when deletion fails', async () => {
    User.findById.mockResolvedValue({ _id: 'u1', bannerImage: '' });
    User.findByIdAndDelete.mockRejectedValue(new Error('db down'));
    const req = mockRequest({ user: { userId: 'u1' } });
    const res = mockResponse();

    await authController.deleteAccount(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
  });
});
