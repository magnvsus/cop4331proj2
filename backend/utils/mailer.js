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

async function sendVerificationEmail(toEmail, token) {
    const link = verificationLink(token);
    await getTransporter().sendMail({
        from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
        to: toEmail,
        subject: 'Verify your Inventory Hub account',
        text: `Welcome to Inventory Hub! Verify your account by visiting: ${link}\n\nThis link expires in 24 hours.`,
        html: `
            <p>Welcome to Inventory Hub!</p>
            <p><a href="${link}">Click here to verify your account</a></p>
            <p>Or paste this link into your browser:<br>${link}</p>
            <p>This link expires in 24 hours.</p>
        `,
    });
}

module.exports = { sendVerificationEmail };
