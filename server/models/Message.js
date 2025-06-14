const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  text: {
    type: String,
    required: true,
    trim: true
  },
  user: {
    type: String,
    required: true
  },
  timestamp: {
    type: Date,
    default: Date.now
  },
  avatar: {
    type: String,
    default: '/images/image.png'
  },
}, {
  timestamps: true
});

module.exports = mongoose.model('Message', messageSchema);