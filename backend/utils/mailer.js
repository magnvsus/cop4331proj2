const nodemailer = require('nodemailer');

// Lazily created so tests (and any environment without email configured)
// don't need real SMTP credentials just to load this module.
let transporter = null;
function getTransporter() {
    if (!transporter) {
        transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: {
                user: process.env.EMAIL_USER,
                pass: process.env.EMAIL_APP_PASSWORD,
            },
        });
    }
    return transporter;
}

// Base URL used to build the link in the email -- points at this API server
// (verification is confirmed by hitting a backend route directly, not
// through the frontend app), e.g. https://your-domain.com or
// http://localhost:5000. Shared with the frontend's own API_DOMAIN var
// (see vite.config.ts) so there's only one URL to keep in sync.
function verificationLink(token) {
    const base = (process.env.API_DOMAIN || 'http://localhost:5000').replace(/\/+$/, '');
    return `${base}/api/auth/verify-email/${token}`;
}

// Used for both first-time verification and reactivating a deactivated
// account -- same link, same underlying token mechanism (see
// authController.verifyEmail), so the copy stays neutral rather than
// presuming "welcome, new user."
async function sendVerificationEmail(toEmail, token) {
    const link = verificationLink(token);

    // Logged unconditionally (not just on failure) so the link is easy to
    // grab from the server console during local testing/demos, without
    // depending on real email delivery actually arriving in time.
    console.log(`Verification/reactivation link for ${toEmail}: ${link}`);

    await getTransporter().sendMail({
        from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
        to: toEmail,
        subject: 'Confirm your Inventory Hub account',
        text: `Confirm your Inventory Hub account by visiting: ${link}\n\nThis link expires in 24 hours.`,
        html: `
            <p>Confirm your Inventory Hub account.</p>
            <p><a href="${link}">Click here to confirm your account</a></p>
            <p>Or paste this link into your browser:<br>${link}</p>
            <p>This link expires in 24 hours.</p>
        `,
    });
}

module.exports = { sendVerificationEmail };
