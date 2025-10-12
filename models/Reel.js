const mongoose = require('mongoose');

const reelSchema = new mongoose.Schema({
  title: { 
    type: String, 
    required: true, 
    maxlength: 60,
    trim: true
  },
  description: { 
    type: String, 
    maxlength: 150,
    trim: true
  },
  videoUrl: { 
    type: String, 
    required: true 
  },
  duration: { 
    type: String,
    default: '0:00'
  },
  isPublished: { 
    type: Boolean, 
    default: false 
  },
  featured: { 
    type: Boolean, 
    default: false 
  },
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('Reel', reelSchema);