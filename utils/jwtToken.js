const sendToken = (user, statusCode, res) => {

    // Create Jwt token
    const token = user.getJwtToken();
    // Options for cookie
    const isProduction = /^production$/i.test(process.env.NODE_ENV || '');
    const options = {
        expires: new Date(
            Date.now() + process.env.COOKIE_EXPIRES_TIME * 24 * 60 * 60 * 1000
        ),
        httpOnly: true,
        secure: isProduction,
        sameSite: isProduction ? 'none' : 'lax',  // 'lax' for dev (HTTP), 'none' for prod (HTTPS)

    }
    res.status(statusCode).cookie('token', token, options).json({
        success: true,
        token,
        user
    })

}

module.exports = sendToken;
