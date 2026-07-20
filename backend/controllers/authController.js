const crypto = require('crypto');
const User = require('../models/User');
const Item = require('../models/Item');
const Category = require('../models/Category');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { deleteLocalUpload } = require('../utils/localUploads');
const { sendVerificationEmail } = require('../utils/mailer');

const EMAIL_VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000;
const RESEND_VERIFICATION_COOLDOWN_MS = 60 * 1000;

// Raw token goes out in the email; only its SHA-256 hash is ever stored, so a
// database leak alone can't be used to verify (or take over) an account.
function createVerificationToken() {
    const rawToken = crypto.randomBytes(32).toString('hex');
    const hashedToken = crypto.createHash('sha256').update(rawToken).digest('hex');
    return { rawToken, hashedToken };
}

function verificationEmailPage(success) {
    const title = success ? 'Email verified' : 'Verification failed';
    const message = success
        ? 'Your account has been verified. You can close this page and log in.'
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
        if (existingUser) { //if existingUser is empty
            return res.status(400).json({ error: 'Email is already registered'});
        }

        // Hash the password
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        const { rawToken, hashedToken } = createVerificationToken();

        // Create and save new user
        const newUser = new User({
            email,
            password: hashedPassword,
            emailVerificationToken: hashedToken,
            emailVerificationExpires: Date.now() + EMAIL_VERIFICATION_TTL_MS
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

        // The 24h TTL is always set to (sentAt + EMAIL_VERIFICATION_TTL_MS)
        // whenever a token is issued, so it doubles as a "last sent" marker
        // without needing a separate field. Enforced here (not just in the
        // frontend button) so the cooldown can't be bypassed by calling this
        // endpoint directly.
        const lastSentAt = user.emailVerificationExpires
            ? user.emailVerificationExpires.getTime() - EMAIL_VERIFICATION_TTL_MS
            : 0;
        const msSinceLastSend = Date.now() - lastSentAt;
        if (msSinceLastSend < RESEND_VERIFICATION_COOLDOWN_MS) {
            const retryAfterSeconds = Math.ceil((RESEND_VERIFICATION_COOLDOWN_MS - msSinceLastSend) / 1000);
            return res.status(429).json({
                error: 'Please wait before requesting another verification email',
                retryAfterSeconds
            });
        }

        const { rawToken, hashedToken } = createVerificationToken();
        user.emailVerificationToken = hashedToken;
        user.emailVerificationExpires = Date.now() + EMAIL_VERIFICATION_TTL_MS;
        await user.save();

        await sendVerificationEmail(user.email, rawToken);

        res.status(200).json({ message: 'Verification email sent' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to resend verification email', details: error.message });
    }
};

// LOGIN
exports.login = async (req, res) => {
    try {
        const { email, password } = req.body;

        // check email
        const user = await User.findOne({ email }).select('+password');
        if (!user) { //could not find email
            return res.status(401).json({ error: 'Invalid email or password'});
        }

        // comapre passwords
        const isMatch = await bcrypt.compare(password, user.password);
        if(!isMatch) { //password did not match
            return res.status(401).json({ error: 'Invalid email or password' });
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

        res.status(200).json({
            user: {
                id: user._id,
                email: user.email,
                isVerified: user.isVerified,
                bannerImage: user.bannerImage || '',
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

        // Clean up everything tied to this account first, so deleting it
        // doesn't leave orphaned items, categories, or uploaded files behind.
        const items = await Item.find({ accountID: userId });
        for (const item of items) {
            await deleteLocalUpload(item.pictureURL);
        }
        await Item.deleteMany({ accountID: userId });
        await Category.deleteMany({ accountID: userId });
        await deleteLocalUpload(user.bannerImage);

        await User.findByIdAndDelete(userId);

        res.status(200).json({ message: 'Account deleted successfully', error: '' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete account', details: error.message});
    }
};