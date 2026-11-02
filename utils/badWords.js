// Bad words filter utility - shared pattern for frontend/backend
// Uses the `bad-words` package (npm install bad-words)

const { Filter } = require('bad-words');

const filter = new Filter();

// Custom profanity words for the store context
filter.addWords(
    'scam', 'fake', 'fraud', 'ripoff', 'garbage', 'trash', 'worst',
    'terrible', 'awful', 'horrible', 'pathetic', 'useless', 'junk',
    'crap', 'shit', 'fuck', 'damn', 'bitch', 'asshole', 'bastard'
);

module.exports = filter;