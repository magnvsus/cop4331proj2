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

const COPY = {
    verify: {
        subject: 'Confirm your Inventory Hub account',
        intro: 'Confirm your Inventory Hub account.',
        cta: 'Click here to confirm your account',
    },
    reactivate: {
        subject: 'Reactivate your Inventory Hub account',
        intro:
            'Your Inventory Hub account was deactivated due to inactivity. You can reactivate it by clicking the link below.',
        cta: 'Click here to reactivate your account',
    },
};

// Same underlying link/token mechanism either way (see
// authController.verifyEmail, which resets deactivatesAt on any successful
// click regardless of reason) -- `reason` only changes the wording, so a
// deactivated-login attempt doesn't confusingly read like a "welcome, new
// user" verification email.
async function sendVerificationEmail(toEmail, token, reason = 'verify') {
    const link = verificationLink(token);
    const copy = COPY[reason] || COPY.verify;

    // Logged unconditionally (not just on failure) so the link is easy to
    // grab from the server console during local testing/demos, without
    // depending on real email delivery actually arriving in time.
    console.log(`${reason === 'reactivate' ? 'Reactivation' : 'Verification'} link for ${toEmail}: ${link}`);

    await getTransporter().sendMail({
        from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
        to: toEmail,
        subject: copy.subject,
        text: `${copy.intro} ${link}\n\nThis link expires in 24 hours.`,
        html: `
            <p>${copy.intro}</p>
            <p><a href="${link}">${copy.cta}</a></p>
            <p>Or paste this link into your browser:<br>${link}</p>
            <p>This link expires in 24 hours.</p>
        `,
    });
}

// Sent when an account is permanently deleted for never being (re)activated
// within its grace period -- no link/token, there's nothing left to click.
async function sendAccountDeletedEmail(toEmail) {
    console.log(`Account-deleted notice sent to ${toEmail}`);

    await getTransporter().sendMail({
        from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
        to: toEmail,
        subject: 'Your Inventory Hub account has been deleted',
        text: `Your Inventory Hub account (${toEmail}) was deactivated due to inactivity and has now been permanently deleted, along with all of its data, after remaining unverified/inactive past the reactivation window. If this was a mistake, you're welcome to register a new account at any time.`,
        html: `
            <p>Your Inventory Hub account (<strong>${toEmail}</strong>) was deactivated due to
            inactivity and has now been permanently deleted, along with all of its data, after
            remaining unverified/inactive past the reactivation window.</p>
            <p>If this was a mistake, you're welcome to register a new account at any time.</p>
        `,
    });
}

module.exports = { sendVerificationEmail, sendAccountDeletedEmail };
