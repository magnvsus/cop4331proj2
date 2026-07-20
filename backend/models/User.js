const mongoose = require('mongoose');

// Cosmetic, per-account dashboard settings (company name/type, manager name,
// brand accent color). Kept as an explicit sub-schema -- rather than a plain
// Mixed/object field -- so Mongoose enforces the same length/format rules
// (e.g. accentColor must be a real hex code) no matter which controller
// writes to it.
const NOTIFICATION_FREQUENCIES = ['immediate', 'hourly', 'daily'];

const DEFAULT_SETTINGS = {
    companyName: 'Coffee Hour',
    businessType: 'Coffee shop',
    managerName: 'Alex Morgan',
    accentColor: '#a9642e',
    notificationsEnabled: false,
    notificationFrequency: 'immediate',
};

const settingsSchema = new mongoose.Schema(
    {
        companyName: { type: String, trim: true, maxlength: 60, default: DEFAULT_SETTINGS.companyName },
        businessType: { type: String, trim: true, maxlength: 60, default: DEFAULT_SETTINGS.businessType },
        managerName: { type: String, trim: true, maxlength: 60, default: DEFAULT_SETTINGS.managerName },
        accentColor: {
            type: String,
            trim: true,
            default: DEFAULT_SETTINGS.accentColor,
            match: [/^#[0-9a-fA-F]{6}$/, 'accentColor must be a hex color code (e.g. #a9642e)'],
        },
        // Low-stock push notifications (delivered on Android only). Kept
        // per-account like the rest of these settings so they follow the
        // user across devices.
        notificationsEnabled: { type: Boolean, default: DEFAULT_SETTINGS.notificationsEnabled },
        notificationFrequency: {
            type: String,
            enum: NOTIFICATION_FREQUENCIES,
            default: DEFAULT_SETTINGS.notificationFrequency,
        },
    },
    { _id: false }
);

const userSchema = new mongoose.Schema({
    email: { type: String, required: true, unique: true, lowercase: true, trim: true},
    password: { type: String, required: true, select: false },
    isVerified: { type: Boolean, default: false },
    // Stores only a SHA-256 hash of the verification token, never the raw
    // value that goes out in the email -- so a database leak alone can't be
    // used to verify (or take over) an account. select: false keeps it out
    // of normal query results, same as password.
    emailVerificationToken: { type: String, select: false },
    emailVerificationExpires: { type: Date, select: false },
    // Set once, at verification time, to (verifiedAt + ACCOUNT_DEACTIVATION_DAYS).
    // Unverified accounts never get this set, so they're never blocked by it --
    // see authController.login/getCurrentUser for the actual enforcement.
    deactivatesAt: { type: Date },
    bannerImage: { type: String },
    settings: { type: settingsSchema, default: () => ({}) }
},
{ timestamps: true }
);

const User = mongoose.model('User', userSchema);
User.DEFAULT_SETTINGS = DEFAULT_SETTINGS;
User.NOTIFICATION_FREQUENCIES = NOTIFICATION_FREQUENCIES;

module.exports = User;