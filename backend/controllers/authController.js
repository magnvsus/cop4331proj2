const User = require('../models/User');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');


// REGISTER
exports.register = async (req, res) => {
    try {
        const { email, password } = req.body;

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
                bannerImage: user.bannerImage || ''
            },
            error: ''
        });

    } catch (error) {
        res.status(500).json({ error: 'Server error during login', details: error.message});
    }
};