const User = require('../models/User');
const Item = require('../models/Item');
const Category = require('../models/Category');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { deleteLocalUpload } = require('../utils/localUploads');

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

        // Create and save new user
        const newUser = new User({
            email,
            password: hashedPassword
        });

        await newUser.save();

        res.status(201).json({ message: 'User registered successfully'});
    } catch (error) {
        res.status(500).json({ error: 'Server error during registration', details: error.message});
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
            { expiresIn: '24h' }
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