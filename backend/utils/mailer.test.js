const nodemailer = require('nodemailer');

jest.mock('nodemailer');

// getTransporter() in mailer.js lazily creates the transporter once and
// caches it at module scope, so the mock needs to be wired up before the
// first call and reused (via mockClear, not a fresh jest.fn()) across tests.
const sendMail = jest.fn().mockResolvedValue(undefined);
nodemailer.createTransport.mockReturnValue({ sendMail });

const { sendVerificationEmail, sendAccountDeletedEmail } = require('./mailer');

describe('mailer.sendVerificationEmail', () => {
  beforeEach(() => {
    sendMail.mockClear();
    jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    console.log.mockRestore();
  });

  it('defaults to verification wording when no reason is given', async () => {
    await sendVerificationEmail('user@example.com', 'raw-token');

    const call = sendMail.mock.calls[0][0];
    expect(call.subject).toMatch(/confirm/i);
    expect(call.subject).not.toMatch(/reactivate/i);
    expect(call.html).toMatch(/confirm your inventory hub account/i);
    expect(call.html).not.toMatch(/deactivated/i);
  });

  it('uses reactivation wording when reason is "reactivate"', async () => {
    await sendVerificationEmail('user@example.com', 'raw-token', 'reactivate');

    const call = sendMail.mock.calls[0][0];
    expect(call.subject).toMatch(/reactivate/i);
    expect(call.html).toMatch(/deactivated due to inactivity/i);
    expect(call.html).toMatch(/reactivate your account/i);
  });

  it('still uses the same verification link/token regardless of reason', async () => {
    await sendVerificationEmail('user@example.com', 'shared-raw-token', 'reactivate');

    const call = sendMail.mock.calls[0][0];
    expect(call.html).toContain('/api/auth/verify-email/shared-raw-token');
  });
});

describe('mailer.sendAccountDeletedEmail', () => {
  beforeEach(() => {
    sendMail.mockClear();
    jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    console.log.mockRestore();
  });

  it('sends a deletion notice with no link or token', async () => {
    await sendAccountDeletedEmail('user@example.com');

    const call = sendMail.mock.calls[0][0];
    expect(call.to).toBe('user@example.com');
    expect(call.subject).toMatch(/deleted/i);
    expect(call.html).toMatch(/permanently deleted/i);
    expect(call.html).not.toContain('/api/auth/verify-email/');
  });
});
