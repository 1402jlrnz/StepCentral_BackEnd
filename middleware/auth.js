const User = require('../models/user')
const jwt = require("jsonwebtoken")

exports.isAuthenticatedUser = async (req, res, next) => {

    // Accept token from Authorization header (frontend sends Bearer token)
    // or from the httpOnly cookie (fallback)
    let token = req.header('Authorization')
    if (token) {
        token = token.split(' ')[1]
    } else if (req.cookies && req.cookies.token) {
        token = req.cookies.token
    }

    if (!token) {
        return res.status(401).json({ message: 'Login first to access this resource' })
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET)
        req.user = await User.findById(decoded.id);
        next()
    } catch (error) {
        return res.status(401).json({ message: 'Token is invalid or has expired' })
    }
};

exports.authorizeRoles = (...roles) => {

    return (req, res, next) => {
        if (!roles.includes(req.user.role)) {
            return res.status(403).json({ message: `Role (${req.user.role}) is not allowed to acccess this resource` })

        }
        next()
    }
}
