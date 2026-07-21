const crypto = require('crypto');
const User = require('../models/User');
const Item = require('../models/Item');
const Category = require('../models/Category');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { deleteLocalUpload } = require('../utils/localUploads');
const { sendVerificationEmail, sendAccountDeletedEmail } = require('../utils/mailer');

const EMAIL_VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000;
const RESEND_VERIFICATION_COOLDOWN_MS = 60 * 1000;

// Raw token goes out in the email; only its SHA-256 hash is ever stored, so a
// database leak alone can't be used to verify (or take over) an account.
function createVerificationToken() {
    const rawToken = crypto.randomBytes(32).toString('hex');
    const hashedToken = crypto.createHash('sha256').update(rawToken).digest('hex');
    return { rawToken, hashedToken };
}

// Both read live (not cached at module load) so tests can override them
// per-case, same reasoning as JWT_EXPIRES_IN below.
function accountDeactivationMs() {
    const days = Number(process.env.ACCOUNT_DEACTIVATION_DAYS);
    return (Number.isFinite(days) && days > 0 ? days : 7) * 24 * 60 * 60 * 1000;
}
function accountDeletionGraceMs() {
    const days = Number(process.env.ACCOUNT_DELETION_GRACE_DAYS);
    return (Number.isFinite(days) && days > 0 ? days : 7) * 24 * 60 * 60 * 1000;
}

// Every account is on this clock from the moment it's registered (see
// register), as a one-time "verify within N days or get locked out" deadline
// -- not a recurring inactivity check. verifyEmail clears deactivatesAt for
// good the moment it succeeds (on time, or late via the auto-sent
// reactivation link), so a verified account is never re-deactivated later
// just for going unused.
function isDeactivated(user) {
    return Boolean(user.deactivatesAt) && user.deactivatesAt.getTime() <= Date.now();
}

// An account that misses its verification deadline and is never reactivated
// (by clicking a fresh link, which clears deactivatesAt -- see verifyEmail)
// gets permanently deleted this long after it deactivated. Implies
// isDeactivated, since deactivatesAt + a non-negative grace period is always
// >= deactivatesAt.
function isPastDeletionGrace(user) {
    return Boolean(user.deactivatesAt) && Date.now() >= user.deactivatesAt.getTime() + accountDeletionGraceMs();
}

function deactivatedResponse(res, user) {
    return res.status(403).json({
        error: 'This account has been deactivated.',
        code: 'ACCOUNT_DEACTIVATED',
        deactivatesAt: user.deactivatesAt
    });
}

// Same cascade as deleteAccount below (uploaded files, items, categories,
// then the account itself) -- shared so an account auto-deleted for
// inactivity doesn't leave orphaned data behind any more than a
// user-initiated deletion would.
async function deleteUserAccount(userId, user) {
    const items = await Item.find({ accountID: userId });
    for (const item of items) {
        await deleteLocalUpload(item.pictureURL);
    }
    await Item.deleteMany({ accountID: userId });
    await Category.deleteMany({ accountID: userId });
    await deleteLocalUpload(user.bannerImage);
    await User.findByIdAndDelete(userId);
}

// Specifically for the "never (re)activated within the grace period" path
// (login, getCurrentUser, and register reclaiming an abandoned email) --
// unlike a user-initiated deleteAccount, this one also emails the address
// to say what happened, since the owner never took any action to cause it.
// The notification is best-effort: a mail failure shouldn't turn an
// otherwise-successful deletion into a 500.
async function deleteInactiveAccount(user) {
    await deleteUserAccount(user._id, user);
    try {
        await sendAccountDeletedEmail(user.email);
    } catch (emailError) {
        console.error('Failed to send account-deleted email:', emailError.message);
    }
}

// Issues a fresh verification/reactivation token and emails it, unless one
// was already sent within the last RESEND_VERIFICATION_COOLDOWN_MS -- shared
// by resendVerification (explicit, logged-in request) and login's
// auto-resend for a deactivated account (implicit, since a deactivated user
// can't reach a "resend" button anywhere in the app -- they can't log in).
// `user` must have emailVerificationExpires selected, since that field
// doubles as the "last sent" marker this cooldown is based on. `reason` is
// passed straight through to sendVerificationEmail to pick the right
// wording -- 'verify' (default) for a never-verified account, 'reactivate'
// for a deactivated one.
async function issueAndSendVerificationToken(user, reason = 'verify') {
    const lastSentAt = user.emailVerificationExpires
        ? user.emailVerificationExpires.getTime() - EMAIL_VERIFICATION_TTL_MS
        : 0;
    const msSinceLastSend = Date.now() - lastSentAt;
    if (msSinceLastSend < RESEND_VERIFICATION_COOLDOWN_MS) {
        return { sent: false, retryAfterSeconds: Math.ceil((RESEND_VERIFICATION_COOLDOWN_MS - msSinceLastSend) / 1000) };
    }

    const { rawToken, hashedToken } = createVerificationToken();
    user.emailVerificationToken = hashedToken;
    user.emailVerificationExpires = Date.now() + EMAIL_VERIFICATION_TTL_MS;
    await user.save();

    await sendVerificationEmail(user.email, rawToken, reason);
    return { sent: true };
}

// Doubles as the reactivation confirmation page -- verifyEmail always clears
// deactivatesAt on a successful match, whether this is someone's on-time
// first verification or a deactivated account being reactivated late, so
// the copy stays neutral rather than assuming which case it is.
function verificationEmailPage(success) {
    const title = success ? 'Account confirmed' : 'Verification failed';
    const message = success
        ? 'Your account is confirmed and active. You can close this page and log in.'
        : 'This verification link is invalid or has expired.';
    return `<!doctype html>
<html>
<head><meta charset="utf-8"><title>${title} - Inventory Hub</title></head>
<body style="font-family: sans-serif; text-align: center; padding: 60px 20px; color: #30251e;">
    <h1 style="color: ${success ? '#477259' : '#a33b31'};">${title}</h1>
    <p>${message}</p>
</body>
</html>`;
}

// Settings updates only ever touch these fields -- anything else in the
// request body is silently ignored rather than merged in, so a crafted
// payload (e.g. { isVerified: true } or { password: '...' }) can't be used
// to mass-assign fields this endpoint was never meant to expose.
const ALLOWED_SETTINGS_FIELDS = [
    'companyName',
    'businessType',
    'managerName',
    'accentColor',
    'notificationsEnabled',
    'notificationFrequency',
];
const HEX_COLOR_REGEX = /^#[0-9a-fA-F]{6}$/;
const MAX_SETTINGS_TEXT_LENGTH = 60;
const NOTIFICATION_FREQUENCIES = ['immediate', 'hourly', 'daily'];

function settingsResponse(settings) {
    return {
        companyName: settings?.companyName || User.DEFAULT_SETTINGS.companyName,
        businessType: settings?.businessType || User.DEFAULT_SETTINGS.businessType,
        managerName: settings?.managerName || User.DEFAULT_SETTINGS.managerName,
        accentColor: settings?.accentColor || User.DEFAULT_SETTINGS.accentColor,
        notificationsEnabled:
            typeof settings?.notificationsEnabled === 'boolean'
                ? settings.notificationsEnabled
                : User.DEFAULT_SETTINGS.notificationsEnabled,
        notificationFrequency: settings?.notificationFrequency || User.DEFAULT_SETTINGS.notificationFrequency,
    };
}


// REGISTER
exports.register = async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ error: 'Email and password are required' });
        }
        if (password.length < 6) {
            return res.status(400).json({ error: 'Password must be at least 6 characters' });
        }

        //check if a user is already created
        const existingUser = await User.findOne({ email });
        if (existingUser) {
            // The old account never verified in time and its grace period
            // has also elapsed -- it's already effectively dead, just not
            // yet lazily cleaned up (see isPastDeletionGrace). Reclaim the
            // email for the new registration instead of blocking on an
            // abandoned account; deleteInactiveAccount also notifies the
            // address that the old one was removed.
            if (isPastDeletionGrace(existingUser)) {
                await deleteInactiveAccount(existingUser);
            } else {
                return res.status(400).json({ error: 'Email is already registered'});
            }
        }

        // Hash the password
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        const { rawToken, hashedToken } = createVerificationToken();

        // Create and save new user. deactivatesAt starts counting down from
        // registration itself, not from verification -- an account that
        // never gets verified in time is blocked from logging in the same
        // way an account that verified and then went unused would be.
        const newUser = new User({
            email,
            password: hashedPassword,
            emailVerificationToken: hashedToken,
            emailVerificationExpires: Date.now() + EMAIL_VERIFICATION_TTL_MS,
            deactivatesAt: new Date(Date.now() + accountDeactivationMs())
        });

        await newUser.save();

        // The account is already created at this point -- a flaky mail
        // provider shouldn't turn that into a failed signup, so a send
        // failure is logged rather than surfaced as an error response.
        try {
            await sendVerificationEmail(email, rawToken);
        } catch (emailError) {
            console.error('Failed to send verification email:', emailError.message);
        }

        res.status(201).json({
            message: 'User registered successfully. Check your email to verify your account.'
        });
    } catch (error) {
        res.status(500).json({ error: 'Server error during registration', details: error.message});
    }
};

// VERIFY EMAIL
exports.verifyEmail = async (req, res) => {
    try {
        const { token } = req.params;
        const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

        const user = await User.findOne({
            emailVerificationToken: hashedToken,
            emailVerificationExpires: { $gt: Date.now() }
        });

        if (!user) {
            return res.status(400).type('html').send(verificationEmailPage(false));
        }

        user.isVerified = true;
        user.emailVerificationToken = undefined;
        user.emailVerificationExpires = undefined;
        // Verifying is a one-time gate, not a recurring clock: succeeding
        // here -- whether that's on time or late, via the auto-sent
        // reactivation link -- clears deactivatesAt for good. A verified
        // account is never re-deactivated later just for going unused.
        user.deactivatesAt = undefined;
        await user.save();

        res.status(200).type('html').send(verificationEmailPage(true));
    } catch (error) {
        res.status(500).type('html').send(verificationEmailPage(false));
    }
};

// RESEND VERIFICATION EMAIL
exports.resendVerification = async (req, res) => {
    try {
        const userId = req.user.userId;
        const user = await User.findById(userId).select('+emailVerificationExpires');
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        if (user.isVerified) {
            return res.status(400).json({ error: 'Account is already verified' });
        }

        // Enforced here (not just in the frontend button) so the cooldown
        // can't be bypassed by calling this endpoint directly.
        const result = await issueAndSendVerificationToken(user);
        if (!result.sent) {
            return res.status(429).json({
                error: 'Please wait before requesting another verification email',
                retryAfterSeconds: result.retryAfterSeconds
            });
        }

        res.status(200).json({ message: 'Verification email sent' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to resend verification email', details: error.message });
    }
};

// LOGIN
exports.login = async (req, res) => {
    try {
        const { email, password } = req.body;

        // check email -- also selects emailVerificationExpires, needed below
        // to enforce the resend cooldown on the auto-sent reactivation email.
        const user = await User.findOne({ email }).select('+password +emailVerificationExpires');
        if (!user) { //could not find email
            return res.status(401).json({ error: 'Invalid email or password'});
        }

        // comapre passwords
        const isMatch = await bcrypt.compare(password, user.password);
        if(!isMatch) { //password did not match
            return res.status(401).json({ error: 'Invalid email or password' });
        }

        if (isDeactivated(user)) {
            // Never reactivated within the grace period -- permanently
            // delete rather than leave it locked out forever.
            if (isPastDeletionGrace(user)) {
                await deleteInactiveAccount(user);
                return res.status(403).json({
                    error: 'This account was deactivated and has since been permanently deleted due to inactivity.',
                    code: 'ACCOUNT_DELETED'
                });
            }

            // Best-effort -- login is rejected either way, and
            // issueAndSendVerificationToken's own cooldown check (not just
            // this catch) is what actually prevents spamming a mailbox from
            // repeated login attempts.
            try {
                await issueAndSendVerificationToken(user, 'reactivate');
            } catch (emailError) {
                console.error('Failed to send reactivation email:', emailError.message);
            }
            return deactivatedResponse(res, user);
        }

        // generate JWT
        const token = jwt.sign(
            { userId: user._id },
            process.env.JWT_SECRET,
            { expiresIn: process.env.JWT_EXPIRES_IN || '24h' }
        );

        res.status(200).json({
            token,
            user: {
                id: user._id,
                email: user.email,
                isVerified: user.isVerified,
                bannerImage: user.bannerImage || '',
                deactivatesAt: user.deactivatesAt || null,
                settings: settingsResponse(user.settings)
            },
            error: ''
        });

    } catch (error) {
        res.status(500).json({ error: 'Server error during login', details: error.message});
    }
};

// CURRENT USER (restores a session from a stored token, e.g. after a page
// refresh, without asking for the password again)
exports.getCurrentUser = async (req, res) => {
    try {
        const user = await User.findById(req.user.userId);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        // A token issued before the account deactivated is still otherwise
        // valid (JWTs aren't revoked on deactivation) -- re-check here too so
        // a page refresh can't keep a deactivated session alive past its
        // deactivatesAt just because the JWT itself hasn't expired yet.
        if (isDeactivated(user)) {
            if (isPastDeletionGrace(user)) {
                await deleteInactiveAccount(user);
                return res.status(403).json({
                    error: 'This account was deactivated and has since been permanently deleted due to inactivity.',
                    code: 'ACCOUNT_DELETED'
                });
            }
            return deactivatedResponse(res, user);
        }

        res.status(200).json({
            user: {
                id: user._id,
                email: user.email,
                isVerified: user.isVerified,
                bannerImage: user.bannerImage || '',
                deactivatesAt: user.deactivatesAt || null,
                settings: settingsResponse(user.settings)
            },
            error: ''
        });
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch current user', details: error.message });
    }
};

// UPDATE BANNER
exports.updateBanner = async (req, res) => {
    try {
        const { bannerImage } = req.body;
        const userId = req.user.userId;

        const previousUser = await User.findById(userId);
        if (!previousUser) {
            return res.status(404).json({ error: 'User not found' });
        }

        const updatedUser = await User.findByIdAndUpdate(
            userId,
            { bannerImage },
            { new: true, runValidators: true }
        );

        // If this replaced an existing banner, clean up the old upload so it
        // doesn't sit around on disk forever.
        if (bannerImage !== previousUser.bannerImage) {
            await deleteLocalUpload(previousUser.bannerImage);
        }

        res.status(200).json({
            user: {
                id: updatedUser._id,
                email: updatedUser.email,
                isVerified: updatedUser.isVerified,
                bannerImage: updatedUser.bannerImage || ''
            },
            error: ''
        });
    } catch (error) {
        res.status(500).json({ error: 'Failed to update banner', details: error.message});
    }
};

// UPDATE SETTINGS
exports.updateSettings = async (req, res) => {
    try {
        const userId = req.user.userId;
        const updates = {};

        for (const field of ALLOWED_SETTINGS_FIELDS) {
            if (!Object.prototype.hasOwnProperty.call(req.body, field)) continue;

            const value = req.body[field];

            if (field === 'notificationsEnabled') {
                if (typeof value !== 'boolean') {
                    return res.status(400).json({ error: 'notificationsEnabled must be a boolean' });
                }
                updates[`settings.${field}`] = value;
                continue;
            }

            if (typeof value !== 'string') {
                return res.status(400).json({ error: `${field} must be a string` });
            }
            const trimmed = value.trim();

            if (field === 'accentColor') {
                if (!HEX_COLOR_REGEX.test(trimmed)) {
                    return res.status(400).json({ error: 'accentColor must be a hex color code (e.g. #a9642e)' });
                }
            } else if (field === 'notificationFrequency') {
                if (!NOTIFICATION_FREQUENCIES.includes(trimmed)) {
                    return res.status(400).json({
                        error: `notificationFrequency must be one of: ${NOTIFICATION_FREQUENCIES.join(', ')}`,
                    });
                }
            } else if (!trimmed || trimmed.length > MAX_SETTINGS_TEXT_LENGTH) {
                return res.status(400).json({ error: `${field} must be between 1 and ${MAX_SETTINGS_TEXT_LENGTH} characters` });
            }

            updates[`settings.${field}`] = trimmed;
        }

        if (Object.keys(updates).length === 0) {
            return res.status(400).json({ error: 'No valid settings fields provided' });
        }

        // Scoped to req.user.userId (from the verified JWT, never from the
        // request body/params) so an authenticated user can only ever update
        // their own settings, never another account's.
        const updatedUser = await User.findByIdAndUpdate(
            userId,
            { $set: updates },
            { new: true, runValidators: true }
        );

        if (!updatedUser) {
            return res.status(404).json({ error: 'User not found' });
        }

        res.status(200).json({
            user: {
                id: updatedUser._id,
                email: updatedUser.email,
                isVerified: updatedUser.isVerified,
                bannerImage: updatedUser.bannerImage || '',
                settings: settingsResponse(updatedUser.settings)
            },
            error: ''
        });
    } catch (error) {
        res.status(500).json({ error: 'Failed to update settings', details: error.message });
    }
};

// DELETE ACCOUNT
exports.deleteAccount = async (req, res) => {
    try {
        const userId = req.user.userId;

        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        // Cleans up everything tied to this account first (uploaded files,
        // items, categories) so deleting it doesn't leave orphans behind.
        await deleteUserAccount(userId, user);

        res.status(200).json({ message: 'Account deleted successfully', error: '' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete account', details: error.message});
    }
};