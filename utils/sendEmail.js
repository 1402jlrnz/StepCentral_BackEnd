const nodemailer = require('nodemailer');

const sendEmail = async options => {
    // Kill switch: set EMAIL_ENABLED=false in .env to pause all emails
    // (e.g. to protect a free Mailtrap sandbox). Code stays intact — just
    // flip it back to 'true' to resume sending.
    if (process.env.EMAIL_ENABLED === 'false') {
        console.log(`[email] EMAIL_ENABLED=false — skipped sending "${options.subject}" to ${options.email}`);
        return;
    }

    const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: process.env.SMTP_PORT,
        auth: {
            user: process.env.SMTP_EMAIL,
            pass: process.env.SMTP_PASSWORD
        }
    });

    const message = {
        from: `${process.env.SMTP_FROM_NAME} <${process.env.SMTP_FROM_EMAIL}>`,
        to: options.email,
        subject: options.subject,
        html: options.html || `<p>${options.message}</p>`,
        attachments: options.attachments || []
    }

    await transporter.sendMail(message)
}

module.exports = sendEmail;
