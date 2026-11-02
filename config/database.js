const mongoose = require('mongoose');
const dns = require('dns');

// Fix: some Windows/firewall setups block Node's default DNS resolver
// (c-ares), which breaks MongoDB Atlas SRV lookups. Fall back to public
// DNS only if the default resolver cannot resolve SRV records.
const ensureDnsWorks = () => new Promise(resolve => {
    dns.resolveSrv('_mongodb._tcp.' + (process.env.DB_URI.match(/@([^/]+)\//) || [])[1], (err) => {
        if (err) {
            dns.setServers(['8.8.8.8', '1.1.1.1']);
            console.log('Default DNS failed, switched to public DNS (8.8.8.8)');
        }
        resolve();
    });
});

const connectDatabase = async () => {
    await ensureDnsWorks();
    mongoose.connect(process.env.DB_URI).then(con => {
        console.log(`MongoDB connected: ${con.connection.host}`);
    }).catch(err => {
        console.error('MongoDB connection failed. Check DB_URI in backend/.env');
        console.error(err.message);
    });
};

module.exports = connectDatabase;
