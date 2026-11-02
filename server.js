const path = require('path');
const dotenv = require('dotenv');

// Load env vars (works no matter which folder you run npm from)
dotenv.config({ path: path.join(__dirname, '.env') });

const app = require('./app');
const connectDatabase = require('./config/database');

// Connect to database
connectDatabase();

const server = app.listen(process.env.PORT, () => {
    console.log(`Server started on PORT: ${process.env.PORT} in ${process.env.NODE_ENV} mode`);
});
