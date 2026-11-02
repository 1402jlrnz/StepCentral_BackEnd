const User = require('../models/user');
const crypto = require('crypto')
const cloudinary = require('cloudinary')
const sendEmail = require('../utils/sendEmail')
const sendToken = require('../utils/jwtToken');
const getFirebaseAdmin = require('../utils/firebase');

// Default avatar for Firebase-created accounts (same pattern as seeder)
const defaultAvatar = async () => {
    const svg = `data:image/svg+xml;base64,${Buffer.from(
        `<svg xmlns="http://www.w3.org/2000/svg" width="150" height="150"><rect width="150" height="150" fill="#232f3e"/><text x="50%" y="55%" font-size="60" font-family="Arial" fill="#febd69" text-anchor="middle" font-weight="bold">SC</text></svg>`
    ).toString('base64')}`;
    const result = await cloudinary.v2.uploader.upload(svg, { folder: 'avatars', width: 150, crop: 'scale' });
    return { public_id: result.public_id, url: result.secure_url };
};

// Firebase Authentication (email/password via Firebase) =>  /api/v1/firebase-auth
// Verifies the Firebase ID token, then creates/finds the local user and
// issues the store's own JWT so the rest of the app works the same way.
exports.firebaseAuth = async (req, res, next) => {
    const { idToken, name } = req.body;

    if (!idToken) {
        return res.status(400).json({ message: 'Firebase ID token is required' })
    }

    const fbAuth = getFirebaseAdmin();
    if (!fbAuth) {
        return res.status(500).json({
            message: 'Firebase is not configured on the server. Set FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL and FIREBASE_PRIVATE_KEY in backend/.env'
        })
    }

    let decoded;
    try {
        decoded = await fbAuth.verifyIdToken(idToken);
    } catch (error) {
        // Surface the real reason (audience mismatch / expired / network to Google certs)
        console.error('[firebase-auth] verifyIdToken failed:', error.code || error.name, '-', error.message)
        return res.status(401).json({ message: 'Invalid or expired Firebase token' })
    }

    const email = decoded.email;
    if (!email) {
        return res.status(400).json({ message: 'Firebase account has no email address' })
    }

    let user = await User.findOne({ email });
    if (!user) {
        const avatar = await defaultAvatar();
        user = await User.create({
            name: name || decoded.name || email.split('@')[0],
            email,
            // random password: this account logs in through Firebase only
            password: crypto.randomBytes(20).toString('hex'),
            avatar,
        })
    }

    sendToken(user, 200, res)
}

exports.registerUser = async (req, res, next) => {
    const { name, email, password, } = req.body;
    // Upload chosen avatar, or fall back to the default SC avatar
    const avatar = req.body.avatar
        ? await cloudinary.v2.uploader.upload(req.body.avatar, {
            folder: 'avatars',
            width: 150,
            crop: "scale"
        })
        : await defaultAvatar();
    const user = await User.create({
        name,
        email,
        password,
        avatar: {
            public_id: avatar.public_id,
            url: avatar.url || avatar.secure_url
        },
    })
    sendToken(user, 200, res)
}

exports.loginUser = async (req, res, next) => {
    let { email, password } = req.body;

    // Checks if email and password is entered by user
    if (!email || !password) {
        return res.status(400).json({ error: 'Please enter email & password' })
    }

    email = email.trim();

    // Finding user in database (case-insensitive)
    let user = await User.findOne({
        email: { $regex: new RegExp(`^${email.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') }
    }).select('+password');

    if (!user) {
        return res.status(401).json({ message: 'Invalid Email or Password' })
    }

    // Checks if password is correct or not
    const isPasswordMatched = await user.comparePassword(password);

    if (!isPasswordMatched) {
        return res.status(401).json({ message: 'Invalid Email or Password' })
    }

    // Block deactivated accounts
    if (user.active === false) {
        return res.status(403).json({ message: 'This account has been deactivated. Please contact support.' })
    }

    user.password = undefined;
    sendToken(user, 200, res)
}

exports.forgotPassword = async (req, res, next) => {
    const user = await User.findOne({ email: req.body.email });
    if (!user) {
        return res.status(404).json({ error: 'User not found with this email' })

    }
    // Get reset token
    const resetToken = user.getResetPasswordToken();
    await user.save({ validateBeforeSave: false });
    // Create reset password url
    const resetUrl = `${req.protocol}://localhost:5173/password/reset/${resetToken}`;
    const message = `Your password reset token are as follow:\n\n${resetUrl}\n\nIf you have not requested this email, then ignore it.`
    try {
        await sendEmail({
            email: user.email,
            subject: 'Step Central Password Recovery',
            message
        })

        res.status(200).json({
            success: true,
            message: `Email sent to: ${user.email}`
        })

    } catch (error) {
        user.resetPasswordToken = undefined;
        user.resetPasswordExpire = undefined;
        await user.save({ validateBeforeSave: false });
        return res.status(500).json({ error: error.message })

    }

}

exports.resetPassword = async (req, res, next) => {
    // Hash URL token
    const resetPasswordToken = crypto.createHash('sha256').update(req.params.token).digest('hex')

    const user = await User.findOne({
        resetPasswordToken,
        resetPasswordExpire: { $gt: Date.now() }
    })

    if (!user) {
        return res.status(400).json({ message: 'Password reset token is invalid or has been expired' })

    }

    if (req.body.password !== req.body.confirmPassword) {
        return res.status(400).json({ message: 'Password does not match' })

    }

    // Setup new password
    user.password = req.body.password;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpire = undefined;
    await user.save();
    sendToken(user, 200, res)

}

exports.getUserProfile = async (req, res, next) => {
    const user = await User.findById(req.user.id);

    return res.status(200).json({
        success: true,
        user
    })
}

exports.updateProfile = async (req, res, next) => {

    const newUserData = {
        name: req.body.name,
        email: req.body.email
    }

    // Update avatar (skip when the client sent no new image — avatar may be '' or undefined)
    if (req.body.avatar) {
        let user = await User.findById(req.user.id)
        const image_id = user.avatar.public_id;
        await cloudinary.v2.uploader.destroy(image_id);
        const result = await cloudinary.v2.uploader.upload(req.body.avatar, {
            folder: 'avatars',
            width: 150,
            crop: "scale"
        })

        newUserData.avatar = {
            public_id: result.public_id,
            url: result.secure_url
        }
    }
    const user = await User.findByIdAndUpdate(req.user.id, newUserData, {
        new: true,
        runValidators: true,
    })
    if (!user) {
        return res.status(401).json({ message: 'User Not Updated' })
    }

    return res.status(200).json({
        success: true,
        user
    })
}

exports.updatePassword = async (req, res, next) => {
    const user = await User.findById(req.user.id).select('+password');
    // Check previous user password
    const isMatched = await user.comparePassword(req.body.oldPassword)
    if (!isMatched) {
        return res.status(400).json({ message: 'Old password is incorrect' })
    }
    user.password = req.body.password;
    await user.save();

    sendToken(user, 200, res)

}

exports.allUsers = async (req, res, next) => {
    const users = await User.find();
    res.status(200).json({
        success: true,
        users
    })
}

exports.deleteUser = async (req, res, next) => {
    const user = await User.findById(req.params.id);

    if (!user) {
        return res.status(401).json({ message: `User does not found with id: ${req.params.id}` })
    }

    // Remove avatar from cloudinary
    const image_id = user.avatar.public_id;
    await cloudinary.v2.uploader.destroy(image_id);
    await User.findByIdAndDelete(req.params.id);
    return res.status(200).json({
        success: true,
    })
}

exports.getUserDetails = async (req, res, next) => {
    const user = await User.findById(req.params.id);

    if (!user) {
        return res.status(400).json({ message: `User does not found with id: ${req.params.id}` })
    }

    res.status(200).json({
        success: true,
        user
    })
}

exports.updateUser = async (req, res, next) => {
    const newUserData = {}

    // Only update fields that were sent (allows activate/deactivate without touching name/email)
    if (req.body.name !== undefined) newUserData.name = req.body.name
    if (req.body.email !== undefined) newUserData.email = req.body.email
    if (req.body.role !== undefined) newUserData.role = req.body.role
    if (req.body.active !== undefined) newUserData.active = req.body.active

    const user = await User.findByIdAndUpdate(req.params.id, newUserData, {
        new: true,
        runValidators: true,
    })

    return res.status(200).json({
        success: true,
        user
    })
}

exports.logout = async (req, res, next) => {
    res.cookie('token', null, {
        expires: new Date(Date.now()),
        httpOnly: true
    })

    return res.status(200).json({
        success: true,
        message: 'Logged out'
    })
}
